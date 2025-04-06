import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, objectLiteral } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodVoid)
export default class ZcVoid extends AbstractCompiledType<z.ZodVoid> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.VoidKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield factory.createIfStatement(
			factory.createStrictInequality(
				factory.createTypeOfExpression(ctx.input),
				factory.createStringLiteral('undefined')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('undefined'),
					received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);
		yield *ctx.outputs(ctx.input);
	}
}
