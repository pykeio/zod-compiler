import { factory, NodeFlags, SyntaxKind } from 'typescript';
import z from 'zod';

import { Dependencies, FunctionalGeneratorContext, InliningMode } from './context.ts';
import { Path, print, propertyChain } from './emit.ts';
import standalone, { type CompiledParser } from './standalone.ts';
import { compilable } from './types/base.ts';

export type * from './runtime/error.ts';
export { ZcError } from './runtime/error.ts';
export { default as AbstractCompiledType } from './types/base.ts';
export * from './types/index.ts';

export { compilable, InliningMode };
export type { CompiledParser };

export interface CompileOptions<Standalone extends boolean = false> {
	/**
	 * Outputs a **standalone** parser.
	 * 
	 * The compiler part of `zod-compiler` depends on Zod and TypeScript -- the latter being a very large dependency. If
	 * you'd wish to deploy a compiled Zod parser to i.e. a different repository separate from your schema definition, or
	 * if you just want a dependency-free parser, you can enable this option to instead output a *standalone parser*.
	 * 
	 * {@linkcode compile compile()} will then return a {@linkcode StandaloneOutput} with the parser's source code as a function.
	 * This source code can be placed in a module, imported, and the function passed to {@linkcode standalone standalone}
	 * (in the `zod-compiler/standalone` module) to create the exact same parser `compile()` normally would - now without
	 * any dependencies!
	 */
	standalone?: Standalone;

	/**
	 * Controls how values are inlined in the generated code. For more information, see {@linkcode InliningMode}.
	 * 
	 * For in-source usage of `zod-compiler`, this need not be changed from `Default`. However, for
	 * {@link CompileOptions.standalone standalone}-compiled schemas, you'll probably want to use {@linkcode InliningMode.Aggressive Aggressive}
	 * for easier deployment.
	 * 
	 * @default InliningMode.Default
	 */
	inlining?: InliningMode;
}

/** The output of a {@link CompileOptions.standalone standalone} compilation. */
export interface StandaloneOutput {
	/**
	 * The source code of the compiled parser function.
	 * 
	 * This is in the form:
	 * ```ts ignore
	 * function (input, ctx) {
	 *     ...
	 * }
	 * ```
	 */
	source: string;

	/**
	 * The list of **dependency** values this parser requires.
	 * 
	 * When the {@link InliningMode inlining mode} is not set to {@linkcode InliningMode.Aggressive Aggressive}, object
	 * values defined in `z.literal()` or via `.default()` or `.catch()` are referenced via a **dependency**; these dependencies
	 * must then be passed to {@linkcode standalone standalone()}. See {@linkcode InliningMode} for more information.
	 * 
	 * Compiling with `inlining: InliningMode.Aggressive` outputs a parser with no dependencies; object values will be
	 * serialized directly in source code.
	 */
	dependencies: readonly any[];

	/** `true` if this parser has any dependencies. */
	readonly hasDependencies: boolean;
}

export interface CompiledNonStandaloneParser<TZod extends z.ZodTypeAny> extends CompiledParser<TZod['_output']> {
	schema: TZod;
}

/**
 * Compile a Zod schema for use out-of-source.
 * 
 * This outputs a {@linkcode StandaloneOutput} which can be used to create a regular {@linkcode CompiledParser} via
 * {@linkcode standalone standalone()}:
 * ```ts
 * import z from 'zod';
 * 
 * const schema = z.string();
 * 
 * const output = compile(schema, { standalone: true });
 * console.log(output.source); // function (input, ctx) { ... }
 * 
 * // put that source in a module and then `import` it...
 * const parserFn = Function(`return ${output.source}`)();
 * 
 * import standalone from 'zod-compiler/standalone';
 * const parser = standalone(parserFn);
 * 
 * console.log(parser.safeParse('Hello, world!')); // { success: true, data: ... }
 * ```
 */
export function compile<TZod extends z.ZodTypeAny>(schema: TZod, options: CompileOptions<true>): StandaloneOutput;
/**
 * Compile a Zod schema to an accelerated parser.
 * ```ts
 * import z from 'zod';
 * 
 * const schema = z.string();
 * 
 * const fastSchema = compile(schema);
 * console.log(fastSchema.safeParse('Hello, world!')); // { success: true, data: ... }
 * ```
 */
export function compile<TZod extends z.ZodTypeAny>(schema: TZod, options?: CompileOptions<false>): CompiledNonStandaloneParser<TZod>;
export function compile<TZod extends z.ZodTypeAny>(schema: TZod, options?: CompileOptions<boolean>): StandaloneOutput | CompiledNonStandaloneParser<TZod>;
export function compile<TZod extends z.ZodTypeAny>(schema: TZod, options?: CompileOptions<boolean>): StandaloneOutput | CompiledNonStandaloneParser<TZod> {
	const type = compilable(schema);

	const verifierContext = factory.createIdentifier('ctx');
	const dependencies = new Dependencies(verifierContext, options?.inlining ?? InliningMode.Default);
	const ctx = new FunctionalGeneratorContext(
		factory.createIdentifier('input'),
		propertyChain(factory.createIdentifier('ctx'), [ 'output' ]),
		verifierContext,
		dependencies
	);

	const functionBody = [
		...ctx.prelude(),
		...type.compileParser(ctx, Path.empty()),
		...ctx.postlude()
	];
	if (options?.standalone) {
		return {
			source: print(factory.createFunctionExpression(
				undefined,
				undefined,
				undefined,
				undefined,
				[
					factory.createParameterDeclaration(undefined, undefined, 'input'),
					factory.createParameterDeclaration(undefined, undefined, 'ctx'),
				],
				undefined,
				factory.createBlock(functionBody, true)
			)),
			dependencies: dependencies.dependencies,
			get hasDependencies() {
				return dependencies.dependencies.length > 0;
			}
		};
	}
	
	const sourceFile = factory.createSourceFile(
		functionBody,
		factory.createToken(SyntaxKind.EndOfFileToken),
		NodeFlags.None
	);
	// Usage of `factory.createUniqueName` requires that `identifiers` is defined and a read-only `Map`. This is usually
	// done after a source file is parsed, but we never do that, so this map doesn't get created and emitting throws errors.
	// Since this is an internal property, this may break on future/older TypeScript versions.
	(sourceFile as any).identifiers = new Map();
	
	const source = print(sourceFile);
	const parser = new Function('input', 'ctx', source);
	return {
		...standalone(parser as any, dependencies.dependencies),
		schema
	};
}

export interface TypesOptions {
	/**
	 * Output the schema as a type alias in the form of `export type Schema = ...` (where `Schema` is configurable via
	 * {@linkcode TypesOptions.schemaName schemaName}).
	 * 
	 * Setting to `false` will return the type definition directly:
	 * ```
	 * import z from 'zod';
	 * import zc from 'zod-compiler';
	 * 
	 * const schema = z.string();
	 * 
	 * console.log(zc.types(schema, { asExport: true }));
	 * // export type Schema = string;
	 * console.log(zc.types(schema, { asExport: false }));
	 * // string
	 * ```
	 * 
	 * @default true
	 */
	asExport?: boolean;

	/**
	 * The name of the generated schema when {@linkcode TypesOptions.asExport asExport} is `true` (the default).
	 * 
	 * ```
	 * import z from 'zod';
	 * import zc from 'zod-compiler';
	 * 
	 * const schema = z.string();
	 * 
	 * console.log(zc.types(schema));
	 * // export type Schema = string;
	 * console.log(zc.types(schema, { schemaName: 'MyStructure' }));
	 * // export type MyStructure = string;
	 * ```
	 * 
	 * @default "Schema"
	 */
	schemaName?: string;
}

/**
 * Exports the `schema` to a TypeScript type definition.
 * 
 * ```ts
 * import z from 'zod';
 * import zc from 'zod-compiler';
 * 
 * const schema = z.string();
 * 
 * console.log(zc.types(schema));
 * // export type Schema = string;
 * ```
 */
export function types<TZod extends z.ZodTypeAny>(schema: TZod, options?: TypesOptions): string {
	const typeDef = compilable(schema).compileType();
	if (options?.asExport ?? true) {
		return print(
			factory.createSourceFile(
				[
					factory.createTypeAliasDeclaration(
						[ factory.createToken(SyntaxKind.ExportKeyword) ],
						options?.schemaName ?? 'Schema',
						undefined,
						typeDef
					)
				],
				factory.createToken(SyntaxKind.EndOfFileToken),
				NodeFlags.None
			)
		);
	} else {
		return print(typeDef);
	}
}
