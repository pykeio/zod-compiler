import ts, { factory, NodeFlags } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, local, objectLiteral, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

export class ArrayGeneratorContext extends LabeledBlockScopeGeneratorContext {
	constructor(
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies,
		private readonly parentStatusSetter: (status: ts.Expression) => Iterable<ts.Statement>
	) {
		super(LabeledShortCircuitMode.Continue, undefined, input, output, verifierContext, dependencies);
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
				yield factory.createContinueStatement();
			} else if (typeof status !== 'number') {
				yield factory.createIfStatement(
					factory.createBitwiseAnd(
						status,
						factory.createNumericLiteral(ParseStatus.INVALID)
					),
					factory.createContinueStatement()
				);
			}
		}
	}

	override withInput(expr: ts.Expression): this {
		const x = <this>new ArrayGeneratorContext(expr, this.output, this.verifierContext, this.dependencies, this.parentStatusSetter);
		x.statusVar = this.statusVar;
		return x;
	}
}

@register(z.ZodFirstPartyTypeKind.ZodArray)
export default class ZcArray<TZod extends z.ZodType> extends AbstractCompiledType<z.ZodArray<TZod>> {
	public override compileType(): ts.TypeNode {
		return factory.createArrayTypeNode(compilable(this.type._def.type).compileType());
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		yield factory.createIfStatement(
			factory.createLogicalNot(
				factory.createCallExpression(
					factory.createPropertyAccessExpression(
						factory.createIdentifier('Array'),
						'isArray'
					),
					undefined,
					[ ctx.input ]
				)
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('array'),
					received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		if (this.type._def.exactLength !== null) {
			const value = factory.createNumericLiteral(this.type._def.exactLength.value);
			const lengthAccessor = factory.createPropertyAccessExpression(
				ctx.input,
				'length'
			);
			const tooBigIdent = uniqueIdentifier('tooBig');
			const tooSmallIdent = uniqueIdentifier('tooSmall');
			yield factory.createIfStatement(
				factory.createStrictInequality(lengthAccessor, value),
				factory.createBlock([
					local(tooBigIdent, factory.createGreaterThan(lengthAccessor, value)),
					local(tooSmallIdent, factory.createLessThan(lengthAccessor, value)),
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createConditionalExpression(
							tooBigIdent,
							undefined,
							factory.createStringLiteral('too_big'),
							undefined,
							factory.createStringLiteral('too_small')
						),
						minimum: factory.createConditionalExpression(
							tooSmallIdent,
							undefined,
							value,
							undefined,
							factory.createIdentifier('undefined')
						),
						maximum: factory.createConditionalExpression(
							tooBigIdent,
							undefined,
							value,
							undefined,
							factory.createIdentifier('undefined')
						),
						type: factory.createStringLiteral('array'),
						inclusive: factory.createTrue(),
						exact: factory.createTrue(),
						message: this.type._def.exactLength.message
							? factory.createStringLiteral(this.type._def.exactLength.message)
							: undefined
					})),
					...ctx.status(ParseStatus.DIRTY)
				], true)
			);
		}

		if (this.type._def.minLength !== null) {
			yield factory.createIfStatement(
				factory.createLessThan(
					factory.createPropertyAccessExpression(
						ctx.input,
						'length'
					),
					factory.createNumericLiteral(this.type._def.minLength.value)
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('too_small'),
						minimum: factory.createNumericLiteral(this.type._def.minLength.value),
						type: factory.createStringLiteral('array'),
						inclusive: factory.createTrue(),
						exact: factory.createFalse(),
						message: this.type._def.minLength.message
							? factory.createStringLiteral(this.type._def.minLength.message)
							: undefined
					})),
					...ctx.status(ParseStatus.DIRTY)
				], true)
			);	
		}

		if (this.type._def.maxLength !== null) {
			yield factory.createIfStatement(
				factory.createGreaterThan(
					factory.createPropertyAccessExpression(
						ctx.input,
						'length'
					),
					factory.createNumericLiteral(this.type._def.maxLength.value)
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('too_big'),
						minimum: factory.createNumericLiteral(this.type._def.maxLength.value),
						type: factory.createStringLiteral('array'),
						inclusive: factory.createTrue(),
						exact: factory.createFalse(),
						message: this.type._def.maxLength.message
							? factory.createStringLiteral(this.type._def.maxLength.message)
							: undefined
					})),
					...ctx.status(ParseStatus.DIRTY)
				], true)
			);	
		}

		const output = uniqueIdentifier('outputArray');
		yield local(
			output,
			factory.createNewExpression(
				factory.createIdentifier('Array'),
				undefined,
				[
					factory.createPropertyAccessExpression(ctx.input, 'length')
				]
			)
		);

		const indexInitializer = factory.createLoopVariable(true);
		const elInitializer = uniqueIdentifier('el');
		const elOutput = factory.createElementAccessExpression(output, indexInitializer);

		const childCtx = new ArrayGeneratorContext(
			elInitializer,
			elOutput,
			ctx.verifierContext,
			ctx.dependencies,
			status => ctx.status(status, false)
		);

		yield factory.createForOfStatement(
			undefined,
			factory.createVariableDeclarationList(
				[
					factory.createVariableDeclaration(
						factory.createArrayBindingPattern([
							factory.createBindingElement(undefined, undefined, indexInitializer),
							factory.createBindingElement(undefined, undefined, elInitializer)
						])
					)
				],
				NodeFlags.Const
			),
			factory.createCallExpression(
				factory.createPropertyAccessExpression(ctx.input, 'entries'),
				undefined,
				undefined
			),
			factory.createBlock([
				...childCtx.prelude(),
				...compilable(this.type._def.type).compileParser(childCtx, path.push(indexInitializer)),
				...childCtx.postlude()
			])
		);

		yield *ctx.outputs(output);
	}
}
