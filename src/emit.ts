import ts, { EmitHint, factory, NodeFlags, ScriptKind, ScriptTarget, TokenFlags } from 'typescript';

import type helpers from './runtime/helpers.ts';

export function randomIdentifier(): ts.Identifier {
	const identifier = new Uint8Array(12);
	crypto.getRandomValues(identifier);
	return factory.createIdentifier('_' + [ ...identifier ].map(v => v.toString(36)).join(''));
}

export function uniqueIdentifier(name: string): ts.Identifier {
	return factory.createUniqueName(name, ts.GeneratedIdentifierFlags.ReservedInNestedScopes);
}

export function local(ident: ts.Identifier, initializer?: ts.Expression | undefined, modifiable = false): ts.VariableStatement {
	return factory.createVariableStatement(
		[],
		factory.createVariableDeclarationList(
			[
				factory.createVariableDeclaration(
					ident,
					undefined,
					undefined,
					initializer
				)
			],
			!modifiable ? NodeFlags.Const : NodeFlags.Let
		)
	);
}

export function objectLiteral(obj: Record<string, ts.Expression | undefined>): ts.ObjectLiteralExpression {
	const entries = Object.entries(obj).filter(([ k, v ]) => !!v) as [string, ts.Expression][];
	return factory.createObjectLiteralExpression(
		entries.map(([ name, expr ]) => factory.createPropertyAssignment(
			factory.createStringLiteral(name),
			expr
		)),
		entries.length > 1
	);
}

const IDENT_REGEX = /^[$A-Z_a-z][\w$]*$/;

export function identifierOrStringLiteral(value: string): ts.Identifier | ts.StringLiteral {
	if (IDENT_REGEX.test(value)) {
		return factory.createIdentifier(value);
	} else {
		return factory.createStringLiteral(value);
	}
}

export function propertyChain(start: ts.Expression, elements: (string | number | ts.Expression)[]): ts.Expression {
	for (let element of elements) {
		if (typeof element === 'string') {
			if (IDENT_REGEX.test(element)) {
				start = factory.createPropertyAccessExpression(start, element);
				continue;
			}
			element = factory.createStringLiteral(element);
		}
	
		start = factory.createElementAccessExpression(start, element);
	}
	return start;
}

export function ifChain(statements: ts.IfStatement[]): ts.IfStatement {
	let statement = statements.pop()!;
	for (const st of statements.reverse()) {
		statement = factory.updateIfStatement(
			statement,
			st.expression,
			st.thenStatement,
			statement
		);
		if (st.thenStatement.kind === ts.SyntaxKind.Block) {
			ts.setEmitFlags(statement, ts.EmitFlags.SingleLine);
		}
	}
	return statement;
}

export function print(node: ts.Node, hint: EmitHint = EmitHint.Unspecified): string {	
	const file = ts.createSourceFile('print.ts', '', ScriptTarget.ES2022, false, ScriptKind.TS);
	const printer = ts.createPrinter();
	return printer.printNode(hint, node, file);
}

export function callHelper(verifierContext: ts.Expression, helper: keyof typeof helpers, ...args: ts.Expression[]) {
	return factory.createCallExpression(
		propertyChain(verifierContext, [ 'helpers', helper ]),
		undefined,
		args
	);
}

export class Path {
	protected constructor(private readonly parts: ts.Expression[]) { }

	static empty(): Path {
		return new Path([]);
	}

	get isEmpty(): boolean {
		return this.parts.length === 0;
	}

	clone(): Path {
		return new Path([...this.parts]);
	}

	push(fragment: string | number | ts.Expression): Path {
		const parts = [...this.parts];
		if (typeof fragment === 'string') {
			parts.push(factory.createStringLiteral(fragment));
		} else if (typeof fragment === 'number') {
			parts.push(factory.createNumericLiteral(fragment, TokenFlags.None));
		} else {
			parts.push(fragment);
		}
		return new Path(parts);
	}

	serialize(): ts.ArrayLiteralExpression {
		return factory.createArrayLiteralExpression(this.parts, false);
	}
}
