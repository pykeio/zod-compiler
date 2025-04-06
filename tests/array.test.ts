import { expect, test } from 'vitest';

import * as z from 'zod';
import * as zc from '../src/index.ts';

const minTwo = zc.compile(z.string().array().min(2));
const maxTwo = zc.compile(z.string().array().max(2));
const justTwo = zc.compile(z.string().array().length(2));
const intNum = zc.compile(z.string().array().nonempty());
const nonEmptyMax = zc.compile(z.string().array().nonempty().max(2));

test("passing validations", () => {
	minTwo.parse(["a", "a"]);
	minTwo.parse(["a", "a", "a"]);
	maxTwo.parse(["a", "a"]);
	maxTwo.parse(["a"]);
	justTwo.parse(["a", "a"]);
	intNum.parse(["a"]);
	nonEmptyMax.parse(["a"]);
});

test("failing validations", () => {
	expect(() => minTwo.parse(["a"])).toThrow();
	expect(() => maxTwo.parse(["a", "a", "a"])).toThrow();
	expect(() => justTwo.parse(["a"])).toThrow();
	expect(() => justTwo.parse(["a", "a", "a"])).toThrow();
	expect(() => intNum.parse([])).toThrow();
	expect(() => nonEmptyMax.parse([])).toThrow();
	expect(() => nonEmptyMax.parse(["a", "a", "a"])).toThrow();
});

test("parse empty array in nonempty", () => {
	expect(() =>
		zc.compile(z
			.array(z.string())
			.nonempty())
			.parse([] as any)
	).toThrow();
});

test("continue parsing despite array size error", () => {
  const schema = zc.compile(z.object({
    people: z.string().array().min(2),
  }));

  const result = schema.safeParse({
    people: [123],
  });
  expect(result.success).toEqual(false);
  if (!result.success) {
    expect(result.error.issues.length).toEqual(2);
  }
});

test("parse should fail given sparse array", () => {
  const schema = zc.compile(z.array(z.string()).nonempty().min(1).max(3));

  expect(() => schema.parse(new Array(3))).toThrow();
});
