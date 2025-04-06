import ts, { factory } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodNullable)
export default class ZcNullable<TZod extends z.ZodType> extends AbstractCompiledType<z.ZodNullable<TZod>> {
	public override compileType(): ts.TypeNode {
		return factory.createUnionTypeNode([
			compilable(this.type._def.innerType).compileType(),
			factory.createLiteralTypeNode(factory.createNull())
		]);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		yield factory.createIfStatement(
			factory.createStrictEquality(
				ctx.input,
				factory.createNull()
			),
			factory.createBlock([
				...ctx.outputs(factory.createNull())
			], true),
			factory.createBlock([
				...compilable(this.type._def.innerType).compileParser(
					ctx,
					path
				)
			], true)
		);
	}
}
