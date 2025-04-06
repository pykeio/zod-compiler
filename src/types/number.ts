import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, uniqueIdentifier, type Path } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import AbstractCompiledType, { register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodNumber)
export default class ZcNumber extends AbstractCompiledType<z.ZodNumber> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.NumberKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		let input = ctx.input;
		if (this.type._def.coerce) {
			const ident = uniqueIdentifier('coercedInput');
			yield local(
				ident,
				factory.createCallExpression(
					factory.createIdentifier('Number'),
					[],
					[ ctx.input ]
				),
				false
			);
			input = ident;
		}

		let stmt = factory.createIfStatement(
			factory.createStrictInequality(
				factory.createTypeOfExpression(input),
				factory.createStringLiteral('number')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('number'),
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
							factory.createNumericLiteral(check.value)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_small'),
								minimum: factory.createNumericLiteral(check.value),
								type: factory.createStringLiteral('number'),
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
							factory.createNumericLiteral(check.value)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_big'),
								minimum: factory.createNumericLiteral(check.value),
								type: factory.createStringLiteral('number'),
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
				case 'int':
					checkStmts.push(
						factory.createIfStatement(
							factory.createLogicalNot(factory.createCallExpression(
								factory.createPropertyAccessExpression(factory.createIdentifier('Number'), 'isInteger'),
								undefined,
								[ input ]
							)),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('invalid_type'),
									expected: factory.createStringLiteral('integer'),
									received: factory.createStringLiteral('float'),
									message: check.message
										? factory.createStringLiteral(check.message)
										: undefined
								}), input),
								...ctx.status(ParseStatus.DIRTY)
							], true)
						)
					);
					break;
				case 'finite':
					checkStmts.push(
						factory.createIfStatement(
							factory.createLogicalNot(factory.createCallExpression(
								factory.createPropertyAccessExpression(factory.createIdentifier('Number'), 'isFinite'),
								undefined,
								[ input ]
							)),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('not_finite'),
									message: check.message
										? factory.createStringLiteral(check.message)
										: undefined
								}), input),
								...ctx.status(ParseStatus.DIRTY)
							], true)
						)
					);
					break;
				case 'multipleOf':
					checkStmts.push(
						factory.createIfStatement(
							factory.createStrictInequality(
								callHelper(ctx.verifierContext, 'floatSafeRemainder', input, factory.createNumericLiteral(check.value)),
								factory.createNumericLiteral(0)
							),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('not_multiple_of'),
									multipleOf: factory.createNumericLiteral(check.value),
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
					throw new Error(`Unsupported ZcNumber check: ${check}`);
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
