import ts, { factory, NodeFlags } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';
import { ObjectGeneratorContext } from './object.ts';
import { ArrayGeneratorContext } from './array.ts';

@register(z.ZodFirstPartyTypeKind.ZodTuple)
export default class ZcTuple<
	T extends [z.ZodTypeAny, ...z.ZodTypeAny[]] | [],
	TRest extends z.ZodTypeAny | null = null
> extends AbstractCompiledType<z.ZodTuple<T, TRest>> {
	public override compileType(): ts.TypeNode {
		const items: ts.TypeNode[] = [];
		for (const item of this.type._def.items) {
			items.push(compilable(item).compileType());
		}
		if (this.type._def.rest) {
			items.push(factory.createRestTypeNode(compilable(this.type._def.rest).compileType()));
		}
		return factory.createTupleTypeNode(items);
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

		yield factory.createIfStatement(
			factory.createLessThan(
				factory.createPropertyAccessExpression(
					ctx.input,
					'length'
				),
				factory.createNumericLiteral(this.type._def.items.length)
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('too_small'),
					minimum: factory.createNumericLiteral(this.type._def.items.length),
					type: factory.createStringLiteral('array'),
					inclusive: factory.createTrue(),
					exact: factory.createFalse()
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		if (!this.type._def.rest) {
			yield factory.createIfStatement(
				factory.createGreaterThan(
					factory.createPropertyAccessExpression(
						ctx.input,
						'length'
					),
					factory.createNumericLiteral(this.type._def.items.length)
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('too_big'),
						minimum: factory.createNumericLiteral(this.type._def.items.length),
						type: factory.createStringLiteral('array'),
						inclusive: factory.createTrue(),
						exact: factory.createFalse()
					})),
					...ctx.status(ParseStatus.DIRTY)
				], true)
			);	
		}

		const output = uniqueIdentifier('outputTuple');
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

		for (const [ i, ty ] of this.type._def.items.entries()) {
			const label = uniqueIdentifier(`item${i}`);
			const inputExpr = propertyChain(ctx.input, [ i ]);
			const outputExpr = propertyChain(output, [ i ]);
	
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
					...compilable(ty).compileParser(childCtx, path.push(i))
				])
			);
		}

		if (this.type._def.rest) {
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

			yield factory.createForStatement(
				local(indexInitializer, factory.createNumericLiteral(this.type._def.items.length), true).declarationList,
				factory.createLessThan(indexInitializer, factory.createPropertyAccessExpression(ctx.input, 'length')),
				factory.createPostfixIncrement(indexInitializer),
				factory.createBlock([
					local(elInitializer, factory.createElementAccessExpression(ctx.input, indexInitializer)),
					...childCtx.prelude(),
					...compilable(this.type._def.rest).compileParser(childCtx, path.push(indexInitializer)),
					...childCtx.postlude()
				])
			);
		}

		yield *ctx.outputs(output);
	}
}
