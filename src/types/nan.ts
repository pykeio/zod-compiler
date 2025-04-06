import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, objectLiteral } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodNaN)
export default class ZcNaN extends AbstractCompiledType<z.ZodNaN> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.NumberKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield factory.createIfStatement(
			factory.createLogicalOr(
				factory.createStrictInequality(
					factory.createTypeOfExpression(ctx.input),
					factory.createStringLiteral('number')
				),
				factory.createLogicalNot(
					factory.createCallExpression(
						factory.createIdentifier('isNaN'),
						undefined,
						[ ctx.input ]
					)
				)
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('nan'),
					received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);
		yield *ctx.outputs(ctx.input);
	}
}
