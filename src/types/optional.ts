import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodOptional)
export default class ZcOptional<TZod extends z.ZodType> extends AbstractCompiledType<z.ZodOptional<TZod>> {
	public override compileType(): ts.TypeNode {
		return factory.createUnionTypeNode([
			compilable(this.type._def.innerType).compileType(),
			factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword)
		]);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		yield factory.createIfStatement(
			factory.createStrictEquality(
				factory.createTypeOfExpression(ctx.input),
				factory.createStringLiteral('undefined')
			),
			factory.createBlock([
				...ctx.outputs(factory.createIdentifier('undefined'))
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
