import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodUnknown)
export default class ZcUnknown extends AbstractCompiledType<z.ZodUnknown> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield *ctx.outputs(ctx.input);
	}
}
