import ts, { factory, NodeFlags, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { BlockScopeGeneratorContext, LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, identifierOrStringLiteral, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

export class ObjectGeneratorContext extends LabeledBlockScopeGeneratorContext {
	constructor(
		label: ts.Identifier,
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies,
		private readonly parentStatusSetter: (status: ts.Expression) => Iterable<ts.Statement>
	) {
		super(LabeledShortCircuitMode.Break, label, input, output, verifierContext, dependencies);
	}

	override *prelude(): Generator<ts.Statement> {}

	override *status(status: ParseStatus | ts.Expression, allowShortCircuiting = true): Generator<ts.Statement> {
		yield *this.parentStatusSetter(
			typeof status === 'number'
				? factory.createNumericLiteral(status)
				: status
		);

		if (allowShortCircuiting) {
			if (status === ParseStatus.INVALID) {
				yield factory.createBreakStatement(this.label);
			} else if (typeof status !== 'number') {
				yield factory.createIfStatement(
					factory.createBitwiseAnd(
						status,
						factory.createNumericLiteral(ParseStatus.INVALID)
					),
					factory.createBreakStatement(this.label)
				);
			}
		}
	}

	override withInput(expr: ts.Expression): this {
		const x = <this>new ObjectGeneratorContext(this.label!, expr, this.output, this.verifierContext, this.dependencies, this.parentStatusSetter);
		x.statusVar = this.statusVar;
		return x;
	}
}

@register(z.ZodFirstPartyTypeKind.ZodObject)
export default class ZcObject<TZod extends z.ZodRawShape> extends AbstractCompiledType<z.ZodObject<TZod>> {
	// In the case of discriminated unions, we already check that the type is an object before passing off parsing
	// to a ZcObject.
	public canSkipTypeCheck = false;

	public override compileType(): ts.TypeNode {
		return factory.createTypeLiteralNode(
			Object.entries(this.type._def.shape()).map(([ key, value ]) => {
				const type = compilable(value);
				const isOptional = value._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional || value.isOptional();
				const node = factory.createPropertySignature(
					undefined,
					identifierOrStringLiteral(key),
					isOptional && value._def.typeName !== z.ZodFirstPartyTypeKind.ZodDefault
						? factory.createToken(SyntaxKind.QuestionToken)
						: undefined,
					type.compileType()
				);
				if (value.description) {
					ts.addSyntheticLeadingComment(node, SyntaxKind.MultiLineCommentTrivia, `* ${value.description} `, true);
				}
				return node;
			})
		);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		if (!this.canSkipTypeCheck) {
			const typeIdentifier = uniqueIdentifier('type');
			yield local(
				typeIdentifier,
				callHelper(ctx.verifierContext, 'typeOf', ctx.input)
			);

			yield factory.createIfStatement(
				factory.createStrictInequality(
					typeIdentifier,
					factory.createStringLiteral('object')
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('invalid_type'),
						expected: factory.createStringLiteral('object'),
						received: typeIdentifier
					})),
					...ctx.status(ParseStatus.INVALID)
				], true)
			);
		}

		const shape = this.type._def.shape();

		// TODO: catchall/passthrough/strict
		// const shapeKeysIdent = uniqueIdentifier('shapeKeys');
		// yield local(
		// 	shapeKeysIdent,
		// 	factory.createNewExpression(
		// 		factory.createIdentifier('Set'),
		// 		[],
		// 		[ factory.createArrayLiteralExpression(Object.keys(shape).map(key => factory.createStringLiteral(key))) ]
		// 	)
		// );

		const output = uniqueIdentifier('outputObject');
		yield local(output, factory.createObjectLiteralExpression());

		for (const [ i, [ key, value ] ] of Object.entries(shape).entries()) {
			const label = uniqueIdentifier(`prop${i}`);
			const inputExpr = propertyChain(ctx.input, [ key ]);
			const outputExpr = propertyChain(output, [ key ]);
	
			const childCtx = new ObjectGeneratorContext(
				label,
				inputExpr,
				outputExpr,
				ctx.verifierContext,
				ctx.dependencies,
				status => ctx.status(status, false)
			);
	
			yield factory.createLabeledStatement(
				label,
				factory.createBlock([
					...compilable(value).compileParser(childCtx, path.push(key))
				])
			);
		}

		yield *ctx.outputs(output);
	}
}
