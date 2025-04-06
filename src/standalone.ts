import { ZcError, ZcIssueCode, type ZcErrorMap, type ZcIssue } from './runtime/error.ts';
import { defaultErrorMap, getErrorMap, setErrorMap } from './runtime/errorMap.ts';
import helpers from './runtime/helpers.ts';
import * as regex from './runtime/regex.ts';

export type * from './runtime/error.ts';
export * from './runtime/errorMap.ts';
export { ZcError, ZcIssueCode };

export const enum ParseStatus {
	VALID = 0,
	/** At least one issue has been identified, but parsing can still continue to identify more. */
	DIRTY = 1,
	/** A fatal issue has been encountered and parsing cannot continue. */
	INVALID = 2
}

export interface ParseContext<T> {
	output: T | null;
	helpers: typeof helpers;
	ZcError: typeof ZcError<T>;
	regex: typeof regex;
	dependencies: readonly any[];
	basePath: (string | number)[];
	errorMaps: ZcErrorMap[];
	issues: ZcIssue[];
	reportIssue(issue: ZcIssue, input?: any): void;
}

export type SafeParseSuccess<T> = {
	success: true;
	data: T;
	error?: never;
};
export type SafeParseError<T> = {
	success: false;
	error: ZcError<T>;
	data?: never;
};

export interface ParseParams {
	path?: (string | number)[];
	errorMap?: ZcErrorMap;
}

export interface CompiledParser<T> {
	parse(data: unknown, params?: ParseParams): T;
	safeParse(data: unknown, params?: ParseParams): SafeParseSuccess<T> | SafeParseError<T>;
}

export const createContext = <T>(dependencies: readonly any[], parseParams: ParseParams | undefined): ParseContext<T> => {
	const overrideMap = getErrorMap();
	return {
		output: null,
		ZcError,
		helpers,
		regex,
		dependencies,
		basePath: parseParams?.path ?? [],
		errorMaps: [
			parseParams?.errorMap,
			overrideMap,
			overrideMap === defaultErrorMap ? undefined : defaultErrorMap
		].filter(x => !!x) as ZcErrorMap[],
		issues: [],
		reportIssue(issue, input = null) {
			const fullPath = [ ...this.basePath, ...(issue.path || []) ];
			const fullIssue = {
				...issue,
				path: fullPath
			};

			if (fullIssue.message !== undefined) {
				this.issues.push(fullIssue);
				return;
			}

			let errorMessage = '';
			const maps = this.errorMaps.filter(m => !!m).slice().reverse();
			for (const map of maps) {
				errorMessage = map(fullIssue, { data: input, defaultError: errorMessage }).message;
			}
			this.issues.push({
				...issue,
				message: errorMessage
			});
		}
	} satisfies ParseContext<T> as ParseContext<T>;
}

export default function standalone<T>(
	parser: Function,
	dependencies: readonly any[] = []
): CompiledParser<T> {
	const typedParser = parser as (data: unknown, context: ParseContext<T>) => ParseStatus;
	return {
		parse(data, params) {
			const ctx = createContext<T>(dependencies, params);

			const status = typedParser(data, ctx);
			if (status === ParseStatus.VALID) {
				return ctx.output!;
			}

			throw new ZcError(ctx.issues);
		},
		safeParse(data, params) {
			const ctx = createContext<T>(dependencies, params);

			const status = typedParser(data, ctx);
			if (status === ParseStatus.VALID) {
				return { success: true, data: ctx.output } as SafeParseSuccess<T>;
			} else {
				return { success: false, error: new ZcError(ctx.issues) } as SafeParseError<T>;
			}
		}
	};
}
