import { stringify, ZcParsedType } from './helpers.ts';

export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;
export type Scalars = Primitive | Primitive[];

export type typeToFlattenedError<T, U = string> = {
	formErrors: U[];
	fieldErrors: {
		[P in keyof T]?: U[];
	};
};

export enum ZcIssueCode {
	invalid_type = 'invalid_type',
	invalid_literal = 'invalid_literal',
	custom = 'custom',
	invalid_union = 'invalid_union',
	invalid_union_discriminator = 'invalid_union_discriminator',
	invalid_enum_value = 'invalid_enum_value',
	unrecognized_keys = 'unrecognized_keys',
	invalid_arguments = 'invalid_arguments',
	invalid_return_type = 'invalid_return_type',
	invalid_date = 'invalid_date',
	invalid_string = 'invalid_string',
	too_small = 'too_small',
	too_big = 'too_big',
	invalid_intersection_types = 'invalid_intersection_types',
	not_multiple_of = 'not_multiple_of',
	not_finite = 'not_finite'
}

export interface ZcIssueBase {
	path: (string | number)[];
	message?: string;
}

export interface ZcInvalidTypeIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_type;
	expected: ZcParsedType;
	received: ZcParsedType;
}

export interface ZcInvalidLiteralIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_literal;
	expected: unknown;
	received: unknown;
}

export interface ZcUnrecognizedKeysIssue extends ZcIssueBase {
	code: ZcIssueCode.unrecognized_keys;
	keys: string[];
}

export interface ZcInvalidUnionIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_union;
	unionErrors: ZcError[];
}

export interface ZcInvalidUnionDiscriminatorIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_union_discriminator;
	options: Primitive[];
}

export interface ZcInvalidEnumValueIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_enum_value;
	received: string | number;
	options: (string | number)[];
}

export interface ZcInvalidArgumentsIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_arguments;
	argumentsError: ZcError;
}

export interface ZcInvalidReturnTypeIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_return_type;
	returnTypeError: ZcError;
}

export interface ZcInvalidDateIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_date;
}

export type StringValidation =
	| 'email'
	| 'url'
	| 'emoji'
	| 'uuid'
	| 'nanoid'
	| 'regex'
	| 'cuid'
	| 'cuid2'
	| 'ulid'
	| 'datetime'
	| 'date'
	| 'time'
	| 'duration'
	| 'ip'
	| 'cidr'
	| 'base64'
	| 'jwt'
	| 'base64url'
	| { includes: string; position?: number }
	| { startsWith: string }
	| { endsWith: string };

export interface ZcInvalidStringIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_string;
	validation: StringValidation;
}

export interface ZcTooSmallIssue extends ZcIssueBase {
	code: ZcIssueCode.too_small;
	minimum: number | bigint;
	inclusive: boolean;
	exact?: boolean;
	type: 'array' | 'string' | 'number' | 'set' | 'date' | 'bigint';
}

export interface ZcTooBigIssue extends ZcIssueBase {
	code: ZcIssueCode.too_big;
	maximum: number | bigint;
	inclusive: boolean;
	exact?: boolean;
	type: 'array' | 'string' | 'number' | 'set' | 'date' | 'bigint';
}

export interface ZcInvalidIntersectionTypesIssue extends ZcIssueBase {
	code: ZcIssueCode.invalid_intersection_types;
}

export interface ZcNotMultipleOfIssue extends ZcIssueBase {
	code: ZcIssueCode.not_multiple_of;
	multipleOf: number | bigint;
}

export interface ZcNotFiniteIssue extends ZcIssueBase {
	code: ZcIssueCode.not_finite;
}

export interface ZcCustomIssue extends ZcIssueBase {
	code: ZcIssueCode.custom;
	params?: { [k: string]: any };
}

export type DenormalizedError = { [k: string]: DenormalizedError | string[] };

export type ZcIssueOptionalMessage =
	| ZcInvalidTypeIssue
	| ZcInvalidLiteralIssue
	| ZcUnrecognizedKeysIssue
	| ZcInvalidUnionIssue
	| ZcInvalidUnionDiscriminatorIssue
	| ZcInvalidEnumValueIssue
	| ZcInvalidArgumentsIssue
	| ZcInvalidReturnTypeIssue
	| ZcInvalidDateIssue
	| ZcInvalidStringIssue
	| ZcTooSmallIssue
	| ZcTooBigIssue
	| ZcInvalidIntersectionTypesIssue
	| ZcNotMultipleOfIssue
	| ZcNotFiniteIssue
	| ZcCustomIssue;

export type ZcIssue = ZcIssueOptionalMessage & {
	fatal?: boolean;
	message: string;
}

type recursiveZcFormattedError<T> = T extends [any, ...any[]]
	? { [K in keyof T]?: ZcFormattedError<T[K]> }
	: T extends any[]
		? { [k: number]: ZcFormattedError<T[number]> }
		: T extends object
			? { [K in keyof T]?: ZcFormattedError<T[K]> }
			: unknown;
export type ZcFormattedError<T, U = string> = { _errors: U[] } & recursiveZcFormattedError<NonNullable<T>>;

export class ZcError<T = any> extends Error {
	get errors(): ZcIssue[] {
		return this.issues;
	}

	constructor(public issues: ZcIssue[]) {
		super();

		// TODO: why is this required?
		const actualProto = new.target.prototype;
		Object.setPrototypeOf(this, actualProto);

		this.name = 'ZcError';
	}

	format(): ZcFormattedError<T>;
	format<U>(mapper: (issue: ZcIssue) => U): ZcFormattedError<T, U>;
	format(_mapper?: any) {
		const mapper: (issue: ZcIssue) => any = _mapper ?? ((issue: ZcIssue) => issue.message);
		const fieldErrors: ZcFormattedError<T> = { _errors: [] } as any;
		const processError = (error: ZcError) => {
			for (const issue of error.issues) {
				if (issue.code === ZcIssueCode.invalid_union) {
					issue.unionErrors.map(processError);
				} else if (issue.code === ZcIssueCode.invalid_return_type) {
					processError(issue.returnTypeError);
				} else if (issue.code === ZcIssueCode.invalid_arguments) {
					processError(issue.argumentsError);
				} else if (issue.path.length === 0) {
					(fieldErrors as any)._errors.push(mapper(issue));
				} else {
					let curr: any = fieldErrors;
					let i = 0;
					while (i < issue.path.length) {
						const el = issue.path[i];
						curr[el] ||= { _errors: [] };

						const terminal = i === issue.path.length - 1;
						if (terminal) {
							curr[el]._errors.push(mapper(issue));
						}

						curr = curr[el];
						i++;
					}
				}
			}
		};
		processError(this);
		return fieldErrors;
	}

	static create(issues: ZcIssue[]): ZcError {
		return new ZcError(issues);
	}

	override toString(): string {
		return this.message;
	}
	override get message(): string {
		return stringify(this.issues);
	}

	get isEmpty(): boolean {
		return this.issues.length === 0;
	}

	addIssue(sub: ZcIssue) {
		// why not push...?
		this.issues = [ ...this.issues, sub ];
	}

	addIssues(subs: ZcIssue[] = []) {
		this.issues = [ ...this.issues, ...subs ];
	}

	flatten(): typeToFlattenedError<T>;
	flatten<U>(mapper?: (issue: ZcIssue) => U): typeToFlattenedError<T, U>;
	flatten<U = string>(mapper: (issue: ZcIssue) => U = (issue: ZcIssue) => issue.message as any): any {
		const fieldErrors: any = {};
		const formErrors: U[] = [];
		for (const sub of this.issues) {
			if (sub.path.length > 0) {
				fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
				fieldErrors[sub.path[0]].push(mapper(sub));
			} else {
				formErrors.push(mapper(sub));
			}
		}
		return { formErrors, fieldErrors };
	}

	get formErrors(): typeToFlattenedError<T> {
		return this.flatten();//.formErrors?;
	}
}

export type IssueData = Omit<ZcIssueOptionalMessage, 'path'> & {
	path?: (string | number)[];
	fatal?: boolean;
};

export type ErrorMapCtx = {
	defaultError: string;
	data: any;
};

export type ZcErrorMap = (
	issue: ZcIssueOptionalMessage,
	ctx: ErrorMapCtx
) => { message: string };
