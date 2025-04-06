import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodEnum)
export default class ZcEnum<T extends [string, ...string[]]> extends AbstractCompiledType<z.ZodEnum<T>> {
	public override compileType(): ts.TypeNode {
		return factory.createUnionTypeNode(this.type._def.values.map(ty => factory.createLiteralTypeNode(factory.createStringLiteral(ty))));
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		const clauses = this.type._def.values.map(value => factory.createCaseClause(factory.createStringLiteral(value), []));
		const lastClause = clauses[clauses.length - 1];
		clauses[clauses.length - 1] = factory.updateCaseClause(
			lastClause,
			lastClause.expression,
			[
				...ctx.outputs(ctx.input),
				factory.createBreakStatement()
			]
		);

		yield factory.createIfStatement(
			factory.createStrictInequality(
				factory.createTypeOfExpression(ctx.input),
				factory.createStringLiteral('string')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral(
						this.type._def.values.map(value => `"${value}"`).join(' | ')
					),
					received: callHelper(ctx.verifierContext, 'typeOf', ctx.input)
				})),
				...ctx.status(ParseStatus.INVALID)
			], true),
			factory.createBlock([
				factory.createSwitchStatement(
					ctx.input,
					factory.createCaseBlock([
						...clauses,
						factory.createDefaultClause([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('invalid_enum_value'),
								options: factory.createArrayLiteralExpression(this.type._def.values.map(value => factory.createStringLiteral(value))),
								received: ctx.input
							})),
							...ctx.status(ParseStatus.INVALID)
						])
					])
				)
			], true)
		);
	}
}
