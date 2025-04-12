import { crazySchema as originalSchema } from '../tests/crazySchema.ts';

import zc from '../src/index.ts';

const sample = {
	tuple: ["asdf", 1234, true, null, undefined, "1234"],
	merged: { k1: "asdf", k2: 12 },
	union: ["asdf", 12, "asdf", 12, "asdf", 12],
	array: [12, 15, 16],
	sumMinLength: [12, 15, 16, 98, 24, 63],
	intersection: {},
	enum: "one",
	nonstrict: { points: 1234 }
};
const compiledSchema = zc.compile(originalSchema);

Deno.bench({ name: 'zod.parse' }, () => {
	originalSchema.safeParse(sample);
});
Deno.bench({ name: 'zc.parse' }, () => {
	compiledSchema.safeParse(sample);
});
