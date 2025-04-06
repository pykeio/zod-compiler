import ts, { factory, SyntaxKind } from 'typescript';
import z from 'zod';

import type IGeneratorContext from '../context.ts';
import { type Path } from '../emit.ts';
import AbstractCompiledType, { compilable, register } from './base.ts';
import { propertyChain, uniqueIdentifier } from '../emit.ts';
import type { Dependencies } from '../context.ts';
import type { ParseStatus } from '../standalone.ts';

class ReadonlyGeneratorContext implements IGeneratorContext {
	public constructor(private readonly ctx: IGeneratorContext) {}

	get dependencies(): Dependencies {
		return this.ctx.dependencies;
	}

	get input(): ts.Expression {
		return this.ctx.input;
	}

	get verifierContext(): ts.Expression {
		return this.ctx.verifierContext;
	}

	withInput(expr: ts.Expression): this {
		return <this>new ReadonlyGeneratorContext(this.ctx.withInput(expr));
	}

	prelude(): Iterable<ts.Statement> {
		return this.ctx.prelude();
	}

	postlude(): Iterable<ts.Statement> {
		return this.ctx.postlude();
	}

	report(expr: ts.Expression): Iterable<ts.Statement> {
		return this.ctx.report(expr);
	}

	status(status: ParseStatus | ts.Expression, allowShortCircuiting?: boolean): Iterable<ts.Statement> {
		return this.ctx.status(status, allowShortCircuiting);
	}
	
	*outputs(expr: ts.Expression): Generator<ts.Statement> {
		yield *this.ctx.outputs(
			factory.createCallExpression(
				propertyChain(factory.createIdentifier('Object'), [ 'freeze' ]),
				undefined,
				[ expr ]
			)
		);
	}
}

@register(z.ZodFirstPartyTypeKind.ZodReadonly)
export default class ZcReadonly<TZod extends z.ZodTypeAny> extends AbstractCompiledType<z.ZodReadonly<TZod>> {
	public override compileType(): ts.TypeNode {
		let innerType = compilable(this.type._def.innerType).compileType();
		if (ts.isArrayTypeNode(innerType)) {
			return factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, innerType);
		} else if (
			ts.isObjectLiteralExpression(innerType)
			|| ts.isUnionTypeNode(innerType)
			|| ts.isIntersectionTypeNode(innerType)
		) {
			return factory.createTypeReferenceNode('Readonly', [ innerType ]);
		} else if (ts.isTypeReferenceNode(innerType) && ts.isIdentifier(innerType.typeName)) {
			switch (innerType.typeName.text) {
				case 'Map':
				case 'Set':
					innerType = factory.updateTypeReferenceNode(
						innerType,
						factory.createIdentifier(`Readonly${innerType.typeName.text}`),
						innerType.typeArguments
					);
					break;
				case 'Record':
					innerType = factory.createTypeReferenceNode('Readonly', [ innerType ]);
					break;
			}
		}
		return innerType;
	}

	public override *compileParser(ctx: IGeneratorContext, path: Path): Iterable<ts.Statement> {
		yield *compilable(this.type._def.innerType).compileParser(new ReadonlyGeneratorContext(ctx), path);
	}
}
