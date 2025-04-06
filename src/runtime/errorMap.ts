import defaultErrorMap from './locales/en.ts';
import type { ZcErrorMap } from './error.ts';

let overrideErrorMap = defaultErrorMap;
export { defaultErrorMap };

export function setErrorMap(map: ZcErrorMap): void {
	overrideErrorMap = map;
}

export function getErrorMap(): ZcErrorMap {
	return overrideErrorMap;
}
