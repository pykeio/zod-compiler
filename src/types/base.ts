import type ts from 'typescript';
import type z from 'zod';

import type IGeneratorContext from '../context.ts';
import type { Path } from '../emit.ts';

export default abstract class AbstractCompiledType<TZod extends z.ZodType> {
	public constructor(protected readonly type: TZod) {}

	public abstract compileType(): ts.TypeNode;

	public abstract compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement>;
}

const registry = new Map<z.ZodFirstPartyTypeKind, new(type: z.ZodTypeAny) => AbstractCompiledType<z.ZodTypeAny>>();

export function register<TZod extends z.ZodFirstPartySchemaTypes>(zodType: TZod['_def']['typeName']) {
	return function(constructor: new(type: TZod) => AbstractCompiledType<TZod>, _context: ClassDecoratorContext<any>) {
		registry.set(zodType, <any>constructor);
	};
}

export function compilable<TZod extends z.ZodTypeAny>(type: TZod): AbstractCompiledType<TZod> {
	const typeName = type._def.typeName;
	if (typeName === undefined) {
		throw new TypeError('Third-party Zod types are not supported');
	}

	const base = registry.get(typeName);
	if (!base) {
		throw new TypeError(`Unimplemented Zod type \`z.${typeName}\``);
	}

	return <AbstractCompiledType<TZod>>new base(type);
}
