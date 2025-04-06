// @ts-ignore TS6133
import { expect, test } from 'vitest';

import * as z from 'zod';
import * as zc from '../src/index.ts';

test("check never inference", () => {
	const t1 = zc.compile(z.never());
	expect(() => t1.parse(undefined)).toThrow();
	expect(() => t1.parse("asdf")).toThrow();
	expect(() => t1.parse(null)).toThrow();
});
