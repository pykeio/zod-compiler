import ts, { factory } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, objectLiteral } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodNull)
export default class ZcNull extends AbstractCompiledType<z.ZodNull> {
	public override compileType(): ts.TypeNode {
		return factory.createLiteralTypeNode(factory.createNull());
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield factory.createIfStatement(
			factory.createStrictInequality(
				ctx.input,
				factory.createNull()
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('null'),
					received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);
		yield *ctx.outputs(ctx.input);
	}
}
