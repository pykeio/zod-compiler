import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, uniqueIdentifier, type Path } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodDate)
export default class ZcDate extends AbstractCompiledType<z.ZodDate> {
	public override compileType(): ts.TypeNode {
		return factory.createTypeReferenceNode('Date');
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		let input = ctx.input;
		if (this.type._def.coerce) {
			const ident = uniqueIdentifier('coercedInput');
			yield local(
				ident,
				factory.createNewExpression(
					factory.createIdentifier('Date'),
					[],
					[ ctx.input ]
				),
				false
			);
			input = ident;
		}

		let stmt = factory.createIfStatement(
			factory.createLogicalNot(
				factory.createBinaryExpression(
					input,
					SyntaxKind.InstanceOfKeyword,
					factory.createIdentifier('Date')
				)
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('date'),
					received: callHelper(ctx.verifierContext, 'typeOf', input)
				}), input),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		const timeVar = uniqueIdentifier('time');
		const checkStmts: ts.Statement[] = [
			local(timeVar, factory.createCallExpression(factory.createPropertyAccessExpression(input, 'getTime'), undefined, [])),
			factory.createIfStatement(
				factory.createCallExpression(
					factory.createIdentifier('isNaN'),
					undefined,
					[ timeVar ]
				),
				factory.createBlock([
					...ctx.report(objectLiteral({
						path: path.serialize(),
						code: factory.createStringLiteral('invalid_date')
					}), input),
					...ctx.status(ParseStatus.INVALID)
				], true)
			)
		];

		for (const check of this.type._def.checks) {
			switch (check.kind) {
				case 'min':
					checkStmts.push(factory.createIfStatement(
						factory.createLessThan(
							timeVar,
							factory.createNumericLiteral(check.value)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_small'),
								minimum: factory.createNumericLiteral(check.value),
								type: factory.createStringLiteral('date'),
								inclusive: factory.createTrue(),
								exact: factory.createFalse(),
								message: check.message
									? factory.createStringLiteral(check.message)
									: undefined
							}), input),
							...ctx.status(ParseStatus.DIRTY)
						], true)
					));
					break;
				case 'max':
					checkStmts.push(factory.createIfStatement(
						factory.createGreaterThan(
							timeVar,
							factory.createNumericLiteral(check.value)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_big'),
								minimum: factory.createNumericLiteral(check.value),
								type: factory.createStringLiteral('date'),
								inclusive: factory.createTrue(),
								exact: factory.createFalse(),
								message: check.message
									? factory.createStringLiteral(check.message)
									: undefined
							}), input),
							...ctx.status(ParseStatus.DIRTY)
						], true)
					));
					break;
				default:
					throw new Error(`Unsupported ZcDate check: ${check}`);
			}
		}

		yield factory.updateIfStatement(
			stmt,
			stmt.expression,
			stmt.thenStatement,
			factory.createBlock([ ...checkStmts ], true)
		);

		yield *ctx.outputs(input);
	}
}
