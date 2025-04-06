import ts, { factory } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { callHelper, local, objectLiteral, propertyChain, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';
import ZcObject from './object.ts';

@register(z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion)
export default class ZcDiscriminatedUnion<
	TDiscriminator extends string,
	TOptions extends readonly z.ZodDiscriminatedUnionOption<TDiscriminator>[]
> extends AbstractCompiledType<z.ZodDiscriminatedUnion<TDiscriminator, TOptions>> {
	public override compileType(): ts.TypeNode {
		return factory.createUnionTypeNode(this.type._def.options.map(ty => compilable(ty).compileType()));
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		const typeIdentifier = uniqueIdentifier('type');
		yield local(
			typeIdentifier,
			callHelper(ctx.verifierContext, 'typeOf', ctx.input)
		);

		yield factory.createIfStatement(
			factory.createStrictInequality(
				typeIdentifier,
				factory.createStringLiteral('object')
			),
			factory.createBlock([
				...ctx.report(objectLiteral({
					path: path.serialize(),
					code: factory.createStringLiteral('invalid_type'),
					expected: factory.createStringLiteral('object'),
					received: typeIdentifier
				})),
				...ctx.status(ParseStatus.INVALID)
			], true)
		);

		yield factory.createSwitchStatement(
			propertyChain(ctx.input, [ this.type._def.discriminator ]),
			factory.createCaseBlock([
				...[ ...this.type._def.optionsMap.entries() ].map(([ discriminator, zodTy ]) => {
					const ty = compilable(zodTy);
					if (ty instanceof ZcObject) {
						// We've already checked that the input is an object.
						ty.canSkipTypeCheck = true;
					}

					return factory.createCaseClause(ctx.dependencies.addOrInline(discriminator), [
						...ty.compileParser(ctx, path),
						factory.createBreakStatement()
					]);
				}),
				factory.createDefaultClause([
					...ctx.report(objectLiteral({
						path: path.push(this.type._def.discriminator).serialize(),
						code: factory.createStringLiteral('invalid_union_discriminator'),
						options: ctx.dependencies.add(Array.from(this.type._def.optionsMap.keys()))
					})),
					...ctx.status(ParseStatus.INVALID)
				])
			])
		);
	}
}
