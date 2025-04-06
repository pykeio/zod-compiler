import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodBoolean)
export default class ZcBoolean extends AbstractCompiledType<z.ZodBoolean> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.BooleanKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		let input = ctx.input;
		if (this.type._def.coerce) {
			const ident = uniqueIdentifier('coercedInput');
			yield local(
				ident,
				factory.createCallExpression(
					factory.createIdentifier('Boolean'),
					[],
					[ ctx.input ]
				),
				false
			);
			input = ident;
		}

		yield factory.createIfStatement(
			factory.createStrictInequality(
				factory.createTypeOfExpression(input),
				factory.createStringLiteral('boolean')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('boolean'),
					received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
				}), input),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);
		yield *ctx.outputs(ctx.input);
	}
}
