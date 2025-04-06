import ts, { factory, NodeFlags, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { BlockScopeGeneratorContext, LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, identifierOrStringLiteral, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';
import { ObjectGeneratorContext } from './object.ts';

@register(z.ZodFirstPartyTypeKind.ZodMap)
export default class ZcMap<K extends z.ZodTypeAny, V extends z.ZodTypeAny> extends AbstractCompiledType<z.ZodMap<K, V>> {
	public override compileType(): ts.TypeNode {
		const [ k, v ] = [ compilable(this.type._def.keyType), compilable(this.type._def.valueType) ];
		return factory.createTypeReferenceNode(
			factory.createIdentifier('Map'),
			[ k.compileType(), v.compileType() ]
		);
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
				factory.createStringLiteral('map')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('map'),
					received: typeIdentifier
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		const output = uniqueIdentifier('outputMap');
		yield local(output, factory.createNewExpression(factory.createIdentifier('Map'), undefined, []));

		const keyLabel = uniqueIdentifier('parseKey');
		const keyInput = uniqueIdentifier('key');
		const keyOutput = uniqueIdentifier('keyOut');
		const valueLabel = uniqueIdentifier('parseValue');
		const valueInput = uniqueIdentifier('value');
		const valueOutput = uniqueIdentifier('valueOut');

		const keyCtx = new ObjectGeneratorContext(
			keyLabel,
			keyInput,
			keyOutput,
			ctx.verifierContext,
			ctx.dependencies,
			status => ctx.status(status, false)
		);
		const valueCtx = new ObjectGeneratorContext(
			valueLabel,
			valueInput,
			valueOutput,
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
							factory.createBindingElement(undefined, undefined, keyInput),
							factory.createBindingElement(undefined, undefined, valueInput)
						])
					)
				],
				NodeFlags.Const
			),
			factory.createCallExpression(factory.createPropertyAccessExpression(ctx.input, 'entries'), undefined, []),
			factory.createBlock([
				local(keyOutput, keyInput, true),
				local(valueOutput, undefined, true),
				factory.createLabeledStatement(
					keyLabel,
					factory.createBlock([
						...compilable(this.type._def.keyType).compileParser(keyCtx, path)
					])
				),
				factory.createLabeledStatement(
					valueLabel,
					factory.createBlock([
						...compilable(this.type._def.valueType).compileParser(valueCtx, path.push(keyOutput))
					])
				),
				factory.createExpressionStatement(
					factory.createCallExpression(
						factory.createPropertyAccessExpression(output, 'set'),
						undefined,
						[ keyOutput, valueOutput ]
					)
				)
			])
		);

		yield *ctx.outputs(output);
	}
}
