import ts, { factory, NodeFlags, SyntaxKind } from 'typescript';

import { identifierOrStringLiteral, propertyChain, uniqueIdentifier } from './emit.ts';
import { ParseStatus } from './standalone.ts';

/**
 * In JavaScript, there exist two main types of values - primitives like strings, numbers, and booleans; and objects like
 * arrays, `Map`s, `Set`s, and, well, *objects*. Two primitives with equal value are equal to each other: `42 === 42` and
 * `"foo" === "foo"`, however ***two objects will never be equal to each other***: `{} !== {}`, `[] !== []`.
 * 
 * Since `zod-compiler` outputs source code which is then {@linkcode eval}uated, it has to get values defined in types
 * like `z.literal()` or `.default()` or `.catch()` from *somewhere*; for primitive types this is fine, and the value can
 * be directly pasted into the source code. However, for objects, this can lead to unexpected behavior if you, for example,
 * expect values returned by `.default()` to be equal to the original value provided in the schema definition.
 * 
 * The default inlining mode is {@linkcode Default}, which inlines *primitives*, but not *objects*. This means that
 * any object values are defined as a **dependency**; they are the *exact same values* taken from the schema definition
 * that the compiled parser can use via a reference. This behavior provides the best compatibility for in-source usage of
 * `zod-compiler`.
 * 
 * For **standalone** builds, however, that would mean that you'd have to provide these dependency references to the parser.
 * `zc.compile()` returns a dependency array which you could then pass to `standalone()`, though you'd have to figure
 * out where those values come from and extract them out of your source tree. Alternatively, the {@linkcode InliningMode.Aggressive Aggressive}
 * inlining mode *will* attempt to inline objects, arrays, `Map`s, and `Set`s. This does mean that these values would
 * no longer be equivalent to their definition, but there's a good chance you don't depend on that behavior anyway.
 */
export enum InliningMode {
	/** Does not inline any values; they will all be added as dependencies. */
	None,
	/** Inlines most primitives: strings, numbers, `BigInt`s, booleans, and `null`/`undefined`. */
	Default,
	/**
	 * Like {@linkcode InliningMode.Default Default}, but also inlines objects, arrays, `Map`s and `Set`s, and regular
	 * expressions.
	 * 
	 * Symbols and functions cannot be inlined.
	 */
	Aggressive
}

export class Dependencies {
	private readonly _dependencies: any[] = [];

	public constructor(private readonly verifierContext: ts.Expression, private readonly inliningMode: InliningMode) {}

	public add(value: any): ts.Expression {
		const i = this._dependencies.push(value) - 1;
		return propertyChain(this.verifierContext, [ 'dependencies', i ]);
	}

	public addOrInline(value: any): ts.Expression {
		if (this.inliningMode === InliningMode.None) {
			return this.add(value);
		}

		const expr = toLiteral(value, this.inliningMode);
		if (expr === null) {
			return this.add(value);
		}
		return expr;
	}

	public get dependencies(): readonly any[] {
		return this._dependencies;
	}
}

export default interface IGeneratorContext {
	get dependencies(): Dependencies;
	get input(): ts.Expression;
	get verifierContext(): ts.Expression;

	prelude(): Iterable<ts.Statement>;
	// this is, apparently, a real word
	postlude(): Iterable<ts.Statement>;

	outputs(expr: ts.Expression): Iterable<ts.Statement>;

	withInput(expr: ts.Expression): this;

	report(issue: ts.Expression, input?: ts.Expression): Iterable<ts.Statement>;

	status(status: ParseStatus | ts.Expression, allowShortCircuiting?: boolean): Iterable<ts.Statement>;
}

abstract class AbstractGeneratorContextWithExprs implements IGeneratorContext {
	private readonly _input: ts.Expression;
	private readonly _output: ts.Expression;
	private readonly _verifierContext: ts.Expression;
	private readonly _dependencies: Dependencies;
	
	constructor(
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies
	) {
		this._input = input;
		this._output = output;
		this._verifierContext = verifierContext;
		this._dependencies = dependencies;
	}

	get input(): ts.Expression {
		return this._input;
	}

	get output(): ts.Expression {
		return this._output;
	}

	get dependencies(): Dependencies {
		return this._dependencies;
	}

	get verifierContext(): ts.Expression {
		return this._verifierContext;
	}

	*prelude(): Iterable<ts.Statement> {}
	*postlude(): Iterable<ts.Statement> {}

	*outputs(expr: ts.Expression): Generator<ts.Statement> {
		yield factory.createExpressionStatement(factory.createAssignment(
			this._output,
			expr
		));
	}

	abstract withInput(expr: ts.Expression): this;

	*report(issue: ts.Expression, input: ts.Expression = this.input): Generator<ts.Statement> {
		yield factory.createExpressionStatement(
			factory.createCallExpression(
				propertyChain(this.verifierContext, [ 'reportIssue' ]),
				undefined,
				[ issue, input ]
			)
		);
	}

	abstract status(status: ParseStatus | ts.Expression, allowShortCircuiting?: boolean): Iterable<ts.Statement>;
}

abstract class AbstractGeneratorContextWithExprsAndStatusVar extends AbstractGeneratorContextWithExprs {
	public statusVar = uniqueIdentifier('status');

	override *prelude(): Generator<ts.Statement> {
		yield factory.createVariableStatement(
			[],
			factory.createVariableDeclarationList(
				[
					factory.createVariableDeclaration(
						this.statusVar,
						undefined,
						undefined,
						factory.createNumericLiteral(ParseStatus.VALID)
					)
				],
				NodeFlags.Let
			)
		);
	}
}

export class FunctionalGeneratorContext extends AbstractGeneratorContextWithExprsAndStatusVar {
	override *postlude(): Generator<ts.Statement> {
		yield factory.createReturnStatement(this.statusVar);
	}

	*status(status: ParseStatus | ts.Expression, allowShortCircuiting = true): Generator<ts.Statement> {
		if (typeof status === 'number') {
			if (status === ParseStatus.INVALID && allowShortCircuiting) {
				yield factory.createReturnStatement(factory.createNumericLiteral(status));
			} else {
				yield factory.createExpressionStatement(
					factory.createBinaryExpression(
						this.statusVar,
						SyntaxKind.BarEqualsToken,
						factory.createNumericLiteral(status)
					)
				);
			}
		} else {
			if (allowShortCircuiting) {
				yield factory.createIfStatement(
					factory.createBitwiseAnd(
						status,
						factory.createNumericLiteral(ParseStatus.INVALID)
					),
					factory.createReturnStatement(status)
				);
			}

			yield factory.createExpressionStatement(
				factory.createBinaryExpression(
					this.statusVar,
					SyntaxKind.BarEqualsToken,
					status
				)
			);
		}
	}

	withInput(expr: ts.Expression): this {
		const x = <this>new FunctionalGeneratorContext(expr, this.output, this.verifierContext, this.dependencies);
		x.statusVar = this.statusVar;
		return x;
	}
}

export class BlockScopeGeneratorContext extends AbstractGeneratorContextWithExprsAndStatusVar {
	*status(status: ParseStatus | ts.Expression): Generator<ts.Statement> {
		yield factory.createExpressionStatement(
			factory.createBinaryExpression(
				this.statusVar,
				SyntaxKind.BarEqualsToken,
				typeof status === 'number'
					? factory.createNumericLiteral(status)
					: status
			)
		);
	}

	withInput(expr: ts.Expression): this {
		const x = <this>new BlockScopeGeneratorContext(expr, this.output, this.verifierContext, this.dependencies);
		x.statusVar = this.statusVar;
		return x;
	}
}

export enum LabeledShortCircuitMode {
	Continue,
	Break
}

export class LabeledBlockScopeGeneratorContext extends AbstractGeneratorContextWithExprsAndStatusVar {
	constructor(
		private readonly mode: LabeledShortCircuitMode,
		protected readonly label: ts.Identifier | undefined,
		input: ts.Expression,
		output: ts.Expression,
		verifierContext: ts.Expression,
		dependencies: Dependencies
	) {
		super(input, output, verifierContext, dependencies);
	}

	*status(status: ParseStatus | ts.Expression, allowShortCircuiting = true): Generator<ts.Statement> {
		yield factory.createExpressionStatement(
			factory.createBinaryExpression(
				this.statusVar,
				SyntaxKind.BarEqualsToken,
				typeof status === 'number'
					? factory.createNumericLiteral(status)
					: status
			)
		);

		if (allowShortCircuiting) {
			const shortCircuit = () => {
				switch (this.mode) {
					case LabeledShortCircuitMode.Break:
						return factory.createBreakStatement(this.label);
					case LabeledShortCircuitMode.Continue:
						return factory.createContinueStatement(this.label);
				}
			};

			if (status === ParseStatus.INVALID) {
				yield shortCircuit();
			} else {
				yield factory.createIfStatement(
					factory.createBitwiseAnd(
						this.statusVar,
						factory.createNumericLiteral(ParseStatus.INVALID)
					),
					shortCircuit()
				);
			}
		}
	}

	withInput(expr: ts.Expression): this {
		const x = <this>new LabeledBlockScopeGeneratorContext(
			this.mode,
			this.label,
			expr,
			this.output,
			this.verifierContext,
			this.dependencies
		);
		x.statusVar = this.statusVar;
		return x;
	}
}

function toLiteral(value: any, mode: InliningMode): ts.Expression | null {
	switch (typeof value) {
		case 'string':
			return factory.createStringLiteral(value);
		case 'number':
			return factory.createNumericLiteral(value);
		case 'bigint':
			return factory.createBigIntLiteral(value.toString());
		case 'undefined':
			return factory.createIdentifier('undefined');
		case 'boolean':
			return value ? factory.createTrue() : factory.createFalse();
		case 'object':
			if (value === null) {
				return factory.createNull();
			}

			if (mode === InliningMode.Aggressive) {
				if (value instanceof RegExp) {
					return factory.createRegularExpressionLiteral(value.toString());
				} else if (value instanceof Map) {
					return factory.createNewExpression(
						factory.createIdentifier('Map'),
						undefined,
						[
							factory.createArrayLiteralExpression(
								[ ...value.entries() ]
									.map(([ k, v ]) => factory.createArrayLiteralExpression([
										toLiteral(k, mode)!,
										toLiteral(v, mode)!
									]))
							)
						]
					);
				} else if (value instanceof Set) {
					return factory.createNewExpression(
						factory.createIdentifier('Set'),
						undefined,
						[
							factory.createArrayLiteralExpression(
								[ ...value.values() ]
									.map(v => toLiteral(v, mode)!)
							)
						]
					);
				} else if (Array.isArray(value)) {
					return factory.createArrayLiteralExpression(value.map(v => toLiteral(v, mode)!));
				} else if (value instanceof Date) {
					return factory.createNewExpression(factory.createIdentifier('Date'), undefined, [ factory.createNumericLiteral(value.getTime()) ])
				} else if (value.constructor === Object) {
					return factory.createObjectLiteralExpression(
						Object.entries(value)
							.map(([ k, v ]) => factory.createPropertyAssignment(
								identifierOrStringLiteral(k),
								toLiteral(v, mode)!
							)
						)
					);
				} else {
					throw new Error(`Value cannot be inlined: ${value}`);
				}
			}
			break;
		case 'function':
		case 'symbol':
			if (mode === InliningMode.Aggressive) {
				throw new Error(`${typeof value === 'function' ? 'Functions' : 'Symbols'} cannot be inlined`);
			}
			break;
	}
	return null;
}
