import ts, { factory } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { local, uniqueIdentifier } from '../emit.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

@register(z.ZodFirstPartyTypeKind.ZodDefault)
export default class ZcDefault<TZod extends z.ZodType> extends AbstractCompiledType<z.ZodDefault<TZod>> {
	public override compileType(): ts.TypeNode {
		return compilable(this.type._def.innerType).compileType();
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		const newInput = uniqueIdentifier('defaultInput');
		yield local(newInput, ctx.input, true);

		const defaultValue = ctx.dependencies.addOrInline(this.type._def.defaultValue());

		yield factory.createIfStatement(
			factory.createStrictEquality(
				factory.createTypeOfExpression(newInput),
				factory.createStringLiteral('undefined')
			),
			factory.createBlock([
				factory.createExpressionStatement(
					factory.createAssignment(
						newInput,
						defaultValue
					)
				)
			], true),
		);

		yield *compilable(this.type._def.innerType).compileParser(
			ctx.withInput(newInput),
			path
		);
	}
}
