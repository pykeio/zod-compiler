import ts, { factory, NodeFlags, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { BlockScopeGeneratorContext, LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { callHelper, identifierOrStringLiteral, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';
import { ObjectGeneratorContext } from './object.ts';

@register(z.ZodFirstPartyTypeKind.ZodRecord)
export default class ZcRecord<K extends z.KeySchema, V extends z.ZodTypeAny> extends AbstractCompiledType<z.ZodRecord<K, V>> {
	public override compileType(): ts.TypeNode {
		const [ k, v ] = [ compilable(this.type._def.keyType), compilable(this.type._def.valueType) ];
		return factory.createTypeReferenceNode(
			factory.createIdentifier('Record'),
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

		const output = uniqueIdentifier('outputObject');
		yield local(output, factory.createObjectLiteralExpression());

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

		yield factory.createForInStatement(
			factory.createVariableDeclarationList(
				[ factory.createVariableDeclaration(keyInput) ],
				NodeFlags.Const
			),
			ctx.input,
			factory.createBlock([
				local(keyOutput, keyInput, true),
				local(valueInput, factory.createElementAccessExpression(ctx.input, keyInput)),
				local(valueOutput, undefined, true),
				factory.createLabeledStatement(
					keyLabel,
					factory.createBlock([
						...compilable(this.type._def.keyType).compileParser(keyCtx, path.push(keyInput))
					])
				),
				factory.createLabeledStatement(
					valueLabel,
					factory.createBlock([
						...compilable(this.type._def.valueType).compileParser(valueCtx, path.push(keyOutput))
					])
				),
				factory.createExpressionStatement(
					factory.createAssignment(
						factory.createElementAccessExpression(output, keyOutput),
						valueOutput
					)
				)
			])
		);

		yield *ctx.outputs(output);
	}
}
