import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, uniqueIdentifier, type Path } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodBigInt)
export default class ZcBigInt extends AbstractCompiledType<z.ZodBigInt> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.BigIntKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		let input = ctx.input;
		if (this.type._def.coerce) {
			const ident = uniqueIdentifier('coercedInput');
			yield local(ident, undefined, true);
			input = ident;

			yield factory.createTryStatement(
				factory.createBlock([
					factory.createExpressionStatement(factory.createAssignment(
						ident,
						factory.createCallExpression(factory.createIdentifier('BigInt'), undefined, [ ctx.input ])
					))
				], true),
				factory.createCatchClause(
					uniqueIdentifier('e'),
					factory.createBlock([
						...ctx.report(objectLiteral({
							path: path.serialize(),
							code: factory.createStringLiteral('invalid_type'),
							expected: factory.createStringLiteral('bigint'),
							received: callHelper(ctx.verifierContext, 'typeOf', input)
						}), input),
						// hopefully this causes a short circuit and the rest of the body doesn't get executed...
						...ctx.status(ParseStatus.INVALID)
					], true)
				),
				undefined
			);
		}

		let stmt = factory.createIfStatement(
			factory.createStrictInequality(
				factory.createTypeOfExpression(input),
				factory.createStringLiteral('bigint')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('bigint'),
					received: callHelper(ctx.verifierContext, 'typeOf', input)
				}), input),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		const checkStmts: ts.Statement[] = [];

		for (const check of this.type._def.checks) {
			switch (check.kind) {
				case 'min':
					checkStmts.push(factory.createIfStatement(
						factory[check.inclusive ? 'createLessThan' : 'createLessThanEquals'](
							input,
							factory.createBigIntLiteral(check.value.toString())
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_small'),
								minimum: factory.createBigIntLiteral(check.value.toString()),
								type: factory.createStringLiteral('bigint'),
								inclusive: check.inclusive ? factory.createTrue() : factory.createFalse(),
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
						factory[check.inclusive ? 'createGreaterThan' : 'createGreaterThanEquals'](
							input,
							factory.createBigIntLiteral(check.value.toString())
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_big'),
								minimum: factory.createBigIntLiteral(check.value.toString()),
								type: factory.createStringLiteral('bigint'),
								inclusive: check.inclusive ? factory.createTrue() : factory.createFalse(),
								exact: factory.createFalse(),
								message: check.message
									? factory.createStringLiteral(check.message)
									: undefined
							}), input),
							...ctx.status(ParseStatus.DIRTY)
						], true)
					));
					break;
				case 'multipleOf':
					checkStmts.push(
						factory.createIfStatement(
							factory.createStrictInequality(
								factory.createModulo(input, factory.createBigIntLiteral(check.value.toString())),
								factory.createBigIntLiteral('0')
							),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('not_multiple_of'),
									multipleOf: factory.createBigIntLiteral(check.value.toString()),
									message: check.message
										? factory.createStringLiteral(check.message)
										: undefined
								}), input),
								...ctx.status(ParseStatus.DIRTY)
							], true)
						)
					);
					break;
				default:
					throw new Error(`Unsupported ZcBigInt check: ${check}`);
			}
		}

		if (checkStmts.length === 0) {
			yield stmt;
		} else {
			stmt = factory.updateIfStatement(
				stmt,
				stmt.expression,
				stmt.thenStatement,
				factory.createBlock([ ...checkStmts ], true)
			);
			yield stmt;
		}

		yield *ctx.outputs(input);
	}
}
