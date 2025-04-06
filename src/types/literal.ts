import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, objectLiteral, type Path } from '../emit.ts';
import { typeOf } from '../runtime/helpers.ts';
import { ParseStatus } from '../standalone.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodLiteral)
export default class ZcLiteral<T> extends AbstractCompiledType<z.ZodLiteral<T>> {
	public override compileType(): ts.TypeNode {
		const value = this.type._def.value;
		let n: ts.LiteralTypeNode['literal'];
		switch (typeof value) {
			case 'string':
				n = factory.createStringLiteral(value);
				break;
			case 'number':
				n = factory.createNumericLiteral(value);
				break;
			case 'bigint':
				n = factory.createBigIntLiteral(value.toString());
				break;
			case 'undefined':
				return factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword);
			case 'boolean':
				n = value ? factory.createTrue() : factory.createFalse();
			case 'object':
				if (value === null) {
					n = factory.createNull();
				}
				// fallthrough
			default:
				throw new Error(`\`zc.ZcLiteral\` only supports primitives (string, number, BigInt, boolean, null, or undefined); got '${typeOf(value)}'`);
		}
		return factory.createLiteralTypeNode(n);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		const value = ctx.dependencies.addOrInline(this.type._def.value);
		yield factory.createIfStatement(
			factory.createStrictInequality(
				ctx.input,
				value
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_literal'),
					expected: value,
					received: ctx.input
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);
		yield *ctx.outputs(ctx.input);
	}
}
