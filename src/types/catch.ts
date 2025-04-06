import ts, { factory } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { LabeledBlockScopeGeneratorContext, LabeledShortCircuitMode, type Dependencies } from '../context.ts';
import { local, uniqueIdentifier } from '../emit.ts';
import { ParseStatus } from '../standalone.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';

class CatchGeneratorContext extends LabeledBlockScopeGeneratorContext {
	constructor(
		label: ts.Identifier,
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies,
		statusVar: ts.Identifier
	) {
		super(LabeledShortCircuitMode.Break, label, input, output, verifierContext, dependencies);
		this.statusVar = statusVar;
	}

	override *prelude(): Generator<ts.Statement> {}

	override withInput(expr: ts.Expression): this {
		const x = <this>new CatchGeneratorContext(this.label!, expr, this.output, this.verifierContext, this.dependencies, this.statusVar);
		x.statusVar = this.statusVar;
		return x;
	}
}

@register(z.ZodFirstPartyTypeKind.ZodCatch)
export default class ZcCatch<TZod extends z.ZodType> extends AbstractCompiledType<z.ZodCatch<TZod>> {
	public override compileType(): ts.TypeNode {
		return compilable(this.type._def.innerType).compileType();
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Generator<ts.Statement> {
		const caughtStatus = uniqueIdentifier('caughtStatus');
		yield local(caughtStatus, factory.createNumericLiteral(ParseStatus.VALID), true);
		const output = uniqueIdentifier('caughtOutput');
		yield local(output, undefined, true);

		const verifierCtxVar = uniqueIdentifier('variantCtx');
		yield local(
			verifierCtxVar,
			factory.createObjectLiteralExpression([
				factory.createSpreadAssignment(ctx.verifierContext),
				factory.createPropertyAssignment('issues', factory.createArrayLiteralExpression())
			], true)
		);

		const label = uniqueIdentifier('catch');
		const childCtx = new CatchGeneratorContext(
			label,
			ctx.input,
			output,
			verifierCtxVar,
			ctx.dependencies,
			caughtStatus
		);

		const catchValue = ctx.dependencies.addOrInline(this.type._def.catchValue(null!));

		yield factory.createLabeledStatement(label, factory.createBlock([
			...childCtx.prelude(),
			...compilable(this.type._def.innerType).compileParser(childCtx, path),
			...childCtx.postlude()
		]));

		yield factory.createIfStatement(
			factory.createStrictInequality(
				caughtStatus,
				factory.createNumericLiteral(ParseStatus.VALID)
			),
			factory.createBlock([
				...ctx.outputs(catchValue)
			], true),
			factory.createBlock([
				...ctx.outputs(output)
			], true),
		);
	}
}
