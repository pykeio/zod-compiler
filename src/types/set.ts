import ts, { factory, NodeFlags } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';
import { ArrayGeneratorContext } from './array.ts';

@register(z.ZodFirstPartyTypeKind.ZodSet)
export default class ZcSet<TZod extends z.ZodType> extends AbstractCompiledType<z.ZodSet<TZod>> {
	public override compileType(): ts.TypeNode {
		return factory.createTypeReferenceNode('Set', [ compilable(this.type._def.valueType).compileType() ]);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		const typeIdentifier = uniqueIdentifier('type');
		yield local(
			typeIdentifier,
			callHelper(ctx.verifierContext, 'typeOf', ctx.input)
		);

		yield factory.createIfStatement(
			factory.createStrictInequality(
				typeIdentifier,
				factory.createStringLiteral('set')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('set'),
					received: typeIdentifier
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		if (this.type._def.minSize !== null) {
			yield factory.createIfStatement(
				factory.createLessThan(
					factory.createPropertyAccessExpression(
						ctx.input,
						'size'
					),
					factory.createNumericLiteral(this.type._def.minSize.value)
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('too_small'),
						minimum: factory.createNumericLiteral(this.type._def.minSize.value),
						type: factory.createStringLiteral('set'),
						inclusive: factory.createTrue(),
						exact: factory.createFalse(),
						message: this.type._def.minSize.message
							? factory.createStringLiteral(this.type._def.minSize.message)
							: undefined
					})),
					...ctx.status(ParseStatus.DIRTY)
				], true)
			);	
		}

		if (this.type._def.maxSize !== null) {
			yield factory.createIfStatement(
				factory.createGreaterThan(
					factory.createPropertyAccessExpression(
						ctx.input,
						'size'
					),
					factory.createNumericLiteral(this.type._def.maxSize.value)
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('too_big'),
						minimum: factory.createNumericLiteral(this.type._def.maxSize.value),
						type: factory.createStringLiteral('set'),
						inclusive: factory.createTrue(),
						exact: factory.createFalse(),
						message: this.type._def.maxSize.message
							? factory.createStringLiteral(this.type._def.maxSize.message)
							: undefined
					})),
					...ctx.status(ParseStatus.DIRTY)
				], true)
			);	
		}

		const output = uniqueIdentifier('outputSet');
		yield local(output, factory.createNewExpression(factory.createIdentifier('Set'), undefined, []));

		const indexInitializer = factory.createLoopVariable(true);
		const elInitializer = uniqueIdentifier('el');
		const elOutput = uniqueIdentifier('elOut');

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
				factory.createPropertyAccessExpression(
					factory.createArrayLiteralExpression([
						factory.createSpreadElement(factory.createCallExpression(
							factory.createPropertyAccessExpression(ctx.input, 'values'),
							undefined,
							[]
						))
					]),
					'entries'
				),
				undefined,
				undefined
			),
			factory.createBlock([
				...childCtx.prelude(),
				local(elOutput, undefined, true),
				...compilable(this.type._def.valueType).compileParser(childCtx, path.push(indexInitializer)),
				...childCtx.postlude(),
				factory.createExpressionStatement(
					factory.createCallExpression(
						factory.createPropertyAccessExpression(output, 'add'),
						undefined,
						[ elOutput ]
					)
				)
			])
		);

		yield *ctx.outputs(output);
	}
}
