import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { register } from './base.ts';
import { joinValues } from '../runtime/helpers.ts';

function getValidEnumValues(obj: any): (string | number)[] {
	const validKeys = Object.keys(obj).filter((k: any) => typeof obj[obj[k]] !== 'number');
	const filtered: any = {};
	for (const k of validKeys) {
		filtered[k] = obj[k];
	}
	return [ ...new Set(Object.values(filtered)) ] as any;
}

@register(z.ZodFirstPartyTypeKind.ZodNativeEnum)
export default class ZcNativeEnum<T extends z.EnumLike> extends AbstractCompiledType<z.ZodNativeEnum<T>> {
	public override compileType(): ts.TypeNode {
		return factory.createUnionTypeNode(
			getValidEnumValues(this.type._def.values)
				.map(value =>  factory.createLiteralTypeNode(
					typeof value === 'string'
						? factory.createStringLiteral(value)
						: factory.createNumericLiteral(value)
				))
		);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		const values = getValidEnumValues(this.type._def.values);
		const clauses = values
			.map(value => factory.createCaseClause(
				typeof value === 'string'
					? factory.createStringLiteral(value)
					: factory.createNumericLiteral(value),
				[]
			));
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
			factory.createLogicalAnd(
				factory.createStrictInequality(
					factory.createTypeOfExpression(ctx.input),
					factory.createStringLiteral('string')
				),
				factory.createStrictInequality(
					factory.createTypeOfExpression(ctx.input),
					factory.createStringLiteral('number')
				)
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral(joinValues(values)),
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
								options: factory.createArrayLiteralExpression(values
									.map(value =>
										typeof value === 'string'
											? factory.createStringLiteral(value)
											: factory.createNumericLiteral(value)
									)),
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
