import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, ifChain, local, objectLiteral, propertyChain, uniqueIdentifier, type Path } from '../emit.ts';
import { DATE as DATE_REGEX } from '../runtime/regex.ts';
import { ParseStatus } from '../standalone.ts';
import AbstractCompiledType, { register } from './base.ts';

function timeRegexSource(args: { precision?: number | null }) {
	let regex = `([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d`;
	if (args.precision) {
		regex = `${regex}\\.\\d{${args.precision}}`;
	} else if (args.precision == null) {
		regex = `${regex}(\\.\\d+)?`;
	}
	return regex;
}

function createTimeRegex(args: {
	offset?: boolean;
	local?: boolean;
	precision?: number | null;
}) {
	return `/^${timeRegexSource(args)}$/`;
}

function createDatetimeRegex(args: {
	precision?: number | null;
	offset?: boolean;
	local?: boolean;
}) {
	let regex = `${DATE_REGEX.source.slice(1, -1)}T${timeRegexSource(args)}`;

	const opts: string[] = [];
	opts.push(args.local ? 'Z?' : 'Z');
	if (args.offset) {
		opts.push(`([+-]\\d{2}:?\\d{2})`);
	}
	regex = `${regex}(${opts.join('|')})`;
	return `/^${regex}$/`;
}

@register(z.ZodFirstPartyTypeKind.ZodString)
export default class ZcString extends AbstractCompiledType<z.ZodString> {
	public override compileType(): ts.TypeNode {
		return factory.createKeywordTypeNode(SyntaxKind.StringKeyword);
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		let input = ctx.input;
		const hasModifyingChecks = this.type._def.checks
			.some(a => a.kind === 'toLowerCase' || a.kind === 'toUpperCase' || a.kind === 'trim');
		if (this.type._def.coerce) {
			const ident = uniqueIdentifier('coercedInput');
			yield local(
				ident,
				factory.createCallExpression(
					factory.createIdentifier('String'),
					[],
					[ ctx.input ]
				),
				hasModifyingChecks
			);
			input = ident;
		} else if (hasModifyingChecks) {
			const ident = uniqueIdentifier('input');
			yield local(ident, input, true);
			input = ident;
		}

		let stmt = factory.createIfStatement(
			factory.createStrictInequality(
				factory.createTypeOfExpression(input),
				factory.createStringLiteral('string')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('string'),
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
						factory.createLessThan(
							propertyChain(input, [ 'length' ]),
							factory.createNumericLiteral(check.value)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_small'),
								minimum: factory.createNumericLiteral(check.value),
								type: factory.createStringLiteral('string'),
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
							propertyChain(input, [ 'length' ]),
							factory.createNumericLiteral(check.value)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('too_big'),
								minimum: factory.createNumericLiteral(check.value),
								type: factory.createStringLiteral('string'),
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
				case 'length':
					const value = factory.createNumericLiteral(check.value);
					const lengthAccessor = factory.createPropertyAccessExpression(
						ctx.input,
						'length'
					);
					const tooBigIdent = uniqueIdentifier('tooBig');
					const tooSmallIdent = uniqueIdentifier('tooSmall');
					checkStmts.push(factory.createIfStatement(
						factory.createStrictInequality(lengthAccessor, value),
						factory.createBlock([
							local(tooBigIdent, factory.createGreaterThan(lengthAccessor, value)),
							local(tooSmallIdent, factory.createLessThan(lengthAccessor, value)),
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createConditionalExpression(
									tooBigIdent,
									undefined,
									factory.createStringLiteral('too_big'),
									undefined,
									factory.createStringLiteral('too_small')
								),
								minimum: factory.createConditionalExpression(
									tooSmallIdent,
									undefined,
									value,
									undefined,
									factory.createIdentifier('undefined')
								),
								maximum: factory.createConditionalExpression(
									tooBigIdent,
									undefined,
									value,
									undefined,
									factory.createIdentifier('undefined')
								),
								type: factory.createStringLiteral('string'),
								inclusive: factory.createTrue(),
								exact: factory.createTrue(),
								message: check.message
									? factory.createStringLiteral(check.message)
									: undefined
							}), input),
							...ctx.status(ParseStatus.DIRTY)
						], true)
					));
					break;
				case 'email':
				case 'emoji':
				case 'uuid':
				case 'nanoid':
				case 'cuid':
				case 'cuid2':
				case 'ulid':
				case 'date':
				case 'duration':
				case 'base64':
				case 'base64url':
					checkStmts.push(ZcString._basicCheck(ctx, path, input, check.kind.toUpperCase(), check.kind, check.message));
					break;
				case 'regex':
					checkStmts.push(ZcString._basicCheck(ctx, path, input, factory.createRegularExpressionLiteral(check.regex.toString()), check.kind, check.message));
					break;
				case 'datetime': {
					const regex = factory.createRegularExpressionLiteral(createDatetimeRegex(check));
					checkStmts.push(ZcString._basicCheck(ctx, path, input, regex, check.kind, check.message));
					break;
				}
				case 'time': {
					const regex = factory.createRegularExpressionLiteral(createTimeRegex(check));
					checkStmts.push(ZcString._basicCheck(ctx, path, input, regex, check.kind, check.message));
					break;
				}
				case 'ip':
				case 'cidr': {
					let cidrSuffix = check.kind === 'cidr' ? '_CIDR' : '';
					if (!check.version) {
						checkStmts.push(factory.createIfStatement(
							factory.createLogicalAnd(
								factory.createLogicalNot(
									factory.createCallExpression(
										propertyChain(ctx.verifierContext, [ 'regex', `IPV4${cidrSuffix}`, 'test' ]),
										undefined,
										[ input ]
									)
								),
								factory.createLogicalNot(
									factory.createCallExpression(
										propertyChain(ctx.verifierContext, [ 'regex', `IPV6${cidrSuffix}`, 'test' ]),
										undefined,
										[ input ]
									)
								)
							),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('invalid_string'),
									validation: factory.createStringLiteral(check.kind),
									message: check.message
										? factory.createStringLiteral(check.message)
										: undefined
								}), input),
								...ctx.status(ParseStatus.DIRTY)
							], true)
						));
					} else {
						checkStmts.push(ZcString._basicCheck(
							ctx,
							path,
							input,
							`IP${check.version.toUpperCase()}${cidrSuffix}`,
							check.kind,
							check.message
						));
					}
					break;
				}
				case 'url':
					checkStmts.push(factory.createTryStatement(
						factory.createBlock([
							factory.createExpressionStatement(factory.createNewExpression(
								factory.createIdentifier('URL'),
								undefined,
								[ input ]
							))
						], true),
						factory.createCatchClause(uniqueIdentifier('e'), factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('invalid_string'),
								validation: factory.createStringLiteral('url'),
								message: check.message
									? factory.createStringLiteral(check.message)
									: undefined
							}), input),
							...ctx.status(ParseStatus.DIRTY)
						], true)),
						undefined
					));
					break;
				case 'jwt':
					checkStmts.push(factory.createIfStatement(
						factory.createLogicalNot(
							callHelper(
								ctx.verifierContext,
								'isValidJWT',
								input,
								check.alg
									? factory.createStringLiteral(check.alg)
									: factory.createIdentifier('undefined')
							)
						),
						factory.createBlock([
							...ctx.report(objectLiteral({
								path: path.serialize(),
								code: factory.createStringLiteral('invalid_string'),
								validation: factory.createStringLiteral('url'),
								message: check.message
									? factory.createStringLiteral(check.message)
									: undefined
							}), input),
							...ctx.status(ParseStatus.DIRTY)
						], true)
					));
					break;
				case 'startsWith':
				case 'endsWith':
					checkStmts.push(
						factory.createIfStatement(
							factory.createLogicalNot(factory.createCallExpression(
								factory.createPropertyAccessExpression(input, check.kind),
								undefined,
								[ factory.createStringLiteral(check.value) ]
							)),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('invalid_string'),
									validation: objectLiteral({
										[check.kind]: factory.createStringLiteral(check.value)
									}),
									message: check.message
										? factory.createStringLiteral(check.message)
										: undefined
								}), input),
								...ctx.status(ParseStatus.DIRTY)
							], true)
						)
					);
					break;
				case 'includes':
					checkStmts.push(
						factory.createIfStatement(
							factory.createLogicalNot(factory.createCallExpression(
								factory.createPropertyAccessExpression(input, 'includes'),
								undefined,
								[
									factory.createStringLiteral(check.value),
									check.position
										? factory.createNumericLiteral(check.position)
										: factory.createIdentifier('undefined')
								]
							)),
							factory.createBlock([
								...ctx.report(objectLiteral({
									path: path.serialize(),
									code: factory.createStringLiteral('invalid_string'),
									validation: objectLiteral({
										includes: factory.createStringLiteral(check.value),
										position: check.position
											? factory.createNumericLiteral(check.position)
											: undefined
									}),
									message: check.message
										? factory.createStringLiteral(check.message)
										: undefined
								}), input),
								...ctx.status(ParseStatus.DIRTY)
							], true)
						)
					);
					break;
				case 'trim':
				case 'toLowerCase':
				case 'toUpperCase': {
					checkStmts.push(
						factory.createExpressionStatement(factory.createAssignment(
							input,
							factory.createCallExpression(
								factory.createPropertyAccessExpression(input, check.kind),
								undefined,
								[]
							)
						))
					);
					break;
				}
				default:
					throw new Error(`Unsupported ZcString check: ${check}`);
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

	private static _basicCheck(
		ctx: IGeneratorContext,
		path: Path,
		input: ts.Expression,
		regexOrTester: string | ts.RegularExpressionLiteral | ts.Expression,
		checkKind: string,
		message?: string
	): ts.IfStatement {
		const testFunction = typeof regexOrTester === 'string'
			? propertyChain(ctx.verifierContext, [ 'regex', regexOrTester, 'test' ])
			: ts.isRegularExpressionLiteral(regexOrTester)
				? factory.createPropertyAccessExpression(regexOrTester, 'test')
				: regexOrTester;

		return factory.createIfStatement(
			factory.createLogicalNot(
				factory.createCallExpression(
					testFunction,
					undefined,
					[ input ]
				)
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_string'),
					validation: factory.createStringLiteral(checkKind),
					message: message
						? factory.createStringLiteral(message)
						: undefined
				}), input),
				...ctx.status(ParseStatus.DIRTY)
			], true)
		);
	}
}
