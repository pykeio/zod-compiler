import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodBranded)
export default class ZcBranded<TZod extends z.ZodTypeAny, B extends string | number | symbol> extends AbstractCompiledType<z.ZodBranded<TZod, B>> {
	public override compileType(): ts.TypeNode {
		return compilable(this.type._def.type).compileType();
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield *compilable(this.type._def.type).compileParser(ctx, path);
	}
}
