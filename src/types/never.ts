import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, objectLiteral } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodNever)
export default class ZcNever extends AbstractCompiledType<z.ZodNever> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.NeverKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield *ctx.report(objectLiteral({
			path: path.serialize(),
			code: factory.createStringLiteral('invalid_type'),
			expected: factory.createStringLiteral('never'),
			received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
		}));
		yield *ctx.status(ParseStatus.INVALID);
	}
}
