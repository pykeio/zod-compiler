import ts, { factory } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, local, objectLiteral, uniqueIdentifier, type Path } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

class IntersectionGeneratorContext extends LabeledBlockScopeGeneratorContext {
	constructor(
		private readonly parentLabel: ts.Identifier,
		label: ts.Identifier,
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies,
		private readonly parentStatusSetter: (status: ts.Expression) => Iterable<ts.Statement>
	) {
		super(LabeledShortCircuitMode.Break, label, input, output, verifierContext, dependencies);
	}

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
		const x = <this>new IntersectionGeneratorContext(
			this.parentLabel,
			this.label!,
			expr,
			this.output,
			this.verifierContext,
			this.dependencies,
			this.parentStatusSetter
		);
		x.statusVar = this.statusVar;
		return x;
	}
}

@register(z.ZodFirstPartyTypeKind.ZodIntersection)
export default class ZcIntersection<
	T extends z.ZodTypeAny,
	U extends z.ZodTypeAny
> extends AbstractCompiledType<z.ZodIntersection<T, U>> {
	public override compileType(): ts.TypeNode {
		return factory.createIntersectionTypeNode([
			compilable(this.type._def.left).compileType(),
			compilable(this.type._def.right).compileType()
		]);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		const mergeOutput = uniqueIdentifier('intersectionOutput');
		const outputA = uniqueIdentifier('outputA');
		const outputB = uniqueIdentifier('outputB');

		const label = uniqueIdentifier('intersection');
		yield factory.createLabeledStatement(label, factory.createBlock([
			...this._generateSide(ctx, path, label, 'left', outputA),
			...this._generateSide(ctx, path, label, 'right', outputB),
			// TODO: We only break one side when parsing fails so that the other can continue to parse; this causes `mergeValues`
			// (and probably the `invalid_intersection_types` issue) to always be called if either side fails. Zod does not do this.
			// We need some way to short circuit here if the status is invalid; context should allow inspecting status instead of
			// being setter-only.
			local(mergeOutput, callHelper(ctx.verifierContext, 'mergeValues', outputA, outputB)),
			factory.createIfStatement(
				factory.createPropertyAccessExpression(mergeOutput, 'valid'),
				factory.createBlock([
					...ctx.outputs(factory.createPropertyAccessExpression(mergeOutput, 'data'))
				], true),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('invalid_intersection_types')
					})),
					...ctx.status(ParseStatus.INVALID)
				])
			)
		]));
	}

	private *_generateSide(
		ctx: IGeneratorContext,
		path: Path,
		parentLabel: ts.Identifier,
		side: 'left' | 'right',
		output: ts.Identifier
	): Generator<ts.Statement> {
		const name = side === 'left' ? 'A' : 'B';
		const label = uniqueIdentifier(`type${name}`);
		yield local(output, undefined, true);

		const childCtx = new IntersectionGeneratorContext(
			parentLabel,
			label,
			ctx.input,
			output,
			ctx.verifierContext,
			ctx.dependencies,
			status => ctx.status(status, false)
		);

		yield factory.createLabeledStatement(
			label,
			factory.createBlock([
				...compilable(this.type._def[side]).compileParser(childCtx, path)
			])
		);
	}
}
