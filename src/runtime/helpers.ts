// Mirrors ZodParsedType from src/helpers/util.ts
export enum ZcParsedType {
	string = 'string',
	nan = 'nan',
	number = 'number',
	integer = 'integer',
	float = 'float',
	boolean = 'boolean',
	date = 'date',
	bigint = 'bigint',
	symbol = 'symbol',
	function = 'function',
	undefined = 'undefined',
	null = 'null',
	array = 'array',
	object = 'object',
	unknown = 'unknown',
	promise = 'promise',
	void = 'void',
	never = 'never',
	map = 'map',
	set = 'set'
}

// Mirrors getParsedType from src/helpers/util.ts
export function typeOf(data: any): ZcParsedType {
	switch (typeof data) {
		case 'undefined':
			return ZcParsedType.undefined;
		case 'string':
			return ZcParsedType.string;
		case 'number':
			return isNaN(data) ? ZcParsedType.nan : ZcParsedType.number;
		case 'boolean':
			return ZcParsedType.boolean;
		case 'function':
			return ZcParsedType.function;
		case 'bigint':
			return ZcParsedType.bigint;
		case 'symbol':
			return ZcParsedType.symbol;
		case 'object':
			if (Array.isArray(data)) {
				return ZcParsedType.array;
			}
			if (data === null) {
				return ZcParsedType.null;
			}
			if (typeof data.then === 'function' && typeof data.catch === 'function') {
				return ZcParsedType.promise;
			}
			if (data instanceof Map) {
				return ZcParsedType.map;
			}
			if (data instanceof Set) {
				return ZcParsedType.set;
			}
			if (data instanceof Date) {
				return ZcParsedType.date;
			}
			return ZcParsedType.object;
		default:
			return ZcParsedType.unknown;
	}
}

// Mirrors mergeValues from src/types.ts
export function mergeValues(a: any, b: any): { valid: true; data: any } | { valid: false } {
	if (a === b) {
		return { valid: true, data: a };
	}

	const aType = typeOf(a);
	const bType = typeOf(b);
	if (aType === ZcParsedType.object && bType === ZcParsedType.object) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter(key => bKeys.indexOf(key) !== -1);

		const newObj = { ...a, ...b };
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) {
				return { valid: false };
			}
			newObj[key] = sharedValue.data;
		}

		return { valid: true, data: newObj };
	} else if (aType === ZcParsedType.array && bType === ZcParsedType.array) {
		if (a.length !== b.length) {
			return { valid: false };
		}

		const newArray = [];
		for (let i = 0; i < a.length; i++) {
			const sharedValue = mergeValues(a[i], b[i]);
			if (!sharedValue.valid) {
				return { valid: false };
			}
			newArray.push(sharedValue.data);
		}

		return { valid: true, data: newArray };
	} else if (aType === ZcParsedType.date && bType == ZcParsedType.date && +a === +b) {
		return { valid: true, data: a };
	} else {
		return { valid: false };
	}
}

export function quotelessJson(obj: any): string {
	return JSON.stringify(obj, null, 2)
		.replace(/"([^"]+)":/g, '$1:');
}

export function stringify(obj: any): string {
	return JSON.stringify(obj, (_, value) => {
		if (typeof value === 'bigint') {
			return value.toString();
		}
		return value;
	}, 2 /* ugggghhhhhhhh */);
}

export function joinValues<T extends any[]>(array: T, separator = ' | '): string {
	return array
		.map(val => typeof val === 'string' ? `'${val}'` : val)
		.join(separator);
}

export function assertNever(_x: never): never {
	throw new Error();
}

export function isValidJWT(jwt: string, alg?: string): boolean {
	try {
		const [ header ] = jwt.split('.');
		// Convert base64url to base64
		const base64 = header
			.replace(/-/g, '+')
			.replace(/_/g, '/')
			.padEnd(header.length + ((4 - (header.length % 4)) % 4), '=');
		const decoded = JSON.parse(atob(base64));
		if (typeof decoded !== 'object' || decoded === null) {
			return false;
		}

		if (!decoded.typ || !decoded.alg) {
			return false;
		}

		if (alg && decoded.alg !== alg) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

export function floatSafeRemainder(val: number, step: number): number {
	const valDecCount = (val.toString().split('.')[1] || '').length;
	const stepDecCount = (step.toString().split('.')[1] || '').length;
	const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
	const valInt = parseInt(val.toFixed(decCount).replace('.', ''));
	const stepInt = parseInt(step.toFixed(decCount).replace('.', ''));
	return (valInt % stepInt) / Math.pow(10, decCount);
}

const helpers = {
	typeOf,
	mergeValues,
	isValidJWT,
	floatSafeRemainder
} as const;
export default helpers;
