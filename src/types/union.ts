import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { local, objectLiteral, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

interface UnionParentContext {
	readonly ctx: IGeneratorContext;
	readonly label: ts.Identifier;
	readonly issues: ts.Expression;
	readonly dirtyResultVar: ts.Identifier;
	readonly dirtyCtxVar: ts.Identifier;
}

class UnionGeneratorContext extends LabeledBlockScopeGeneratorContext {
	constructor(
		label: ts.Identifier,
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies,
		private readonly parent: UnionParentContext
	) {
		super(LabeledShortCircuitMode.Break, label, input, output, verifierContext, dependencies);
	}

	override *postlude(): Generator<ts.Statement> {
		yield factory.createIfStatement(
			factory.createStrictEquality(this.statusVar, factory.createNumericLiteral(ParseStatus.VALID)),
			factory.createBlock([
				...this.parent.ctx.outputs(this.output),
				factory.createBreakStatement(this.parent.label)
			], true),
			factory.createIfStatement(
				factory.createLogicalAnd(
					factory.createStrictEquality(this.statusVar, factory.createNumericLiteral(ParseStatus.DIRTY)),
					factory.createLogicalNot(this.parent.dirtyResultVar)
				),
				factory.createBlock([
					factory.createExpressionStatement(
						factory.createAssignment(this.parent.dirtyResultVar, this.output)
					),
					factory.createExpressionStatement(
						factory.createAssignment(this.parent.dirtyCtxVar, this.verifierContext)
					)
				])
			)
		);

		// imho, this shouldn't be behind a condition, but it's how zod does it and I promise parity
		const childIssues = factory.createPropertyAccessExpression(this.verifierContext, 'issues');
		yield factory.createIfStatement(
			factory.createPropertyAccessExpression(childIssues, 'length'),
			factory.createBlock([
				factory.createExpressionStatement(factory.createCallExpression(
					factory.createPropertyAccessExpression(this.parent.issues, 'push'),
					undefined,
					[ childIssues ]
				))
			], true)
		);
	}

	override withInput(expr: ts.Expression): this {
		const x = <this>new UnionGeneratorContext(
			this.label!,
			expr,
			this.output,
			this.verifierContext,
			this.dependencies,
			this.parent
		);
		x.statusVar = this.statusVar;
		return x;
	}
}

@register(z.ZodFirstPartyTypeKind.ZodUnion)
export default class ZcUnion<T extends z.ZodUnionOptions> extends AbstractCompiledType<z.ZodUnion<T>> {
	public override compileType(): ts.TypeNode {
		return factory.createUnionTypeNode(this.type._def.options.map(ty => compilable(ty).compileType()));
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		const dirtyResultVar = uniqueIdentifier('unionDirtyResult');
		const dirtyCtxVar = uniqueIdentifier('unionDirtyCtx');
		const issuesVar = uniqueIdentifier('unionIssues');

		yield local(dirtyResultVar, undefined, true);
		yield local(dirtyCtxVar, undefined, true);
		yield local(issuesVar, factory.createArrayLiteralExpression(), false);

		const mainLabel = uniqueIdentifier('union');
		yield factory.createLabeledStatement(mainLabel, factory.createBlock([
			...this.type._def.options.flatMap((opt, i) => {
				function *generateBody() {
					const ty = compilable(opt);

					const variantLabel = uniqueIdentifier(`unionVariant_${i}`);
					const tmpOutput = uniqueIdentifier('variantOutput');
					const childVerifierCtxVar = uniqueIdentifier('variantCtx');
					yield local(tmpOutput, undefined, true);
					yield local(
						childVerifierCtxVar,
						factory.createObjectLiteralExpression([
							factory.createSpreadAssignment(ctx.verifierContext),
							factory.createPropertyAssignment('issues', factory.createArrayLiteralExpression())
						], true)
					);

					const childCtx = new UnionGeneratorContext(
						variantLabel,
						ctx.input,
						tmpOutput,
						childVerifierCtxVar,
						ctx.dependencies,
						{
							ctx,
							label: mainLabel,
							dirtyCtxVar,
							dirtyResultVar,
							issues: issuesVar
						}
					);
					yield *childCtx.prelude();
					yield factory.createLabeledStatement(
						variantLabel,
						factory.createBlock([
							...ty.compileParser(childCtx, path)
						], true)
					)
					yield *childCtx.postlude();
				}

				return [ ...generateBody() ];
			}),
			factory.createIfStatement(
				dirtyCtxVar,
				factory.createBlock([
					...ctx.report(factory.createSpreadElement(factory.createPropertyAccessExpression(dirtyCtxVar, 'issues'))),
					...ctx.status(ParseStatus.DIRTY)
				], true),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('invalid_union'),
						unionErrors: factory.createCallExpression(
							factory.createPropertyAccessExpression(issuesVar, 'map'),
							undefined,
							[ factory.createArrowFunction(
								undefined,
								undefined,
								[ factory.createParameterDeclaration(undefined, undefined, 'issues') ],
								undefined,
								undefined,
								factory.createNewExpression(
									factory.createPropertyAccessExpression(ctx.verifierContext, 'ZcError'),
									undefined,
									[ factory.createIdentifier('issues') ]
								)
							) ]
						)
					})),
					...ctx.status(ParseStatus.INVALID)
				], true)
			)
		]));
	}
}
