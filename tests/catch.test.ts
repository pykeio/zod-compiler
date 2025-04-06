import { expect, test } from 'vitest';

import * as z from 'zod';
import * as zc from '../src/index.ts';

test("basic catch", () => {
  expect(zc.compile(z.string().catch("default")).parse(undefined)).toBe("default");
});

test("catch replace wrong types", () => {
  expect(zc.compile(z.string().catch("default")).parse(true)).toBe("default");
  expect(zc.compile(z.string().catch("default")).parse(true)).toBe("default");
  expect(zc.compile(z.string().catch("default")).parse(15)).toBe("default");
  expect(zc.compile(z.string().catch("default")).parse([])).toBe("default");
  expect(zc.compile(z.string().catch("default")).parse(new Map())).toBe("default");
  expect(zc.compile(z.string().catch("default")).parse(new Set())).toBe("default");
  expect(zc.compile(z.string().catch("default")).parse({})).toBe("default");
});

test("catch on existing optional", () => {
  const stringWithDefault = zc.compile(z.string().optional().catch("asdf"));
  expect(stringWithDefault.parse(undefined)).toBe(undefined);
  expect(stringWithDefault.parse(15)).toBe("asdf");
});

test("nested", () => {
  const inner = z.string().catch("asdf");
  const outer = zc.compile(z.object({ inner }).catch({
    inner: "asdf",
  }));
  expect(outer.parse(undefined)).toEqual({ inner: "asdf" });
  expect(outer.parse({})).toEqual({ inner: "asdf" });
  expect(outer.parse({ inner: undefined })).toEqual({ inner: "asdf" });
});

test("chained catch", () => {
  const stringWithDefault = zc.compile(z.string().catch("inner").catch("outer"));
  const result = stringWithDefault.parse(undefined);
  expect(result).toEqual("inner");
  const resultDiff = stringWithDefault.parse(5);
  expect(resultDiff).toEqual("inner");
});

test("native enum", () => {
  enum Fruits {
    apple = "apple",
    orange = "orange",
  }

  const schema = zc.compile(z.object({
    fruit: z.nativeEnum(Fruits).catch(Fruits.apple),
  }));

  expect(schema.parse({})).toEqual({ fruit: Fruits.apple });
  expect(schema.parse({ fruit: 15 })).toEqual({ fruit: Fruits.apple });
});

test("enum", () => {
  const schema = zc.compile(z.object({
    fruit: z.enum(["apple", "orange"]).catch("apple"),
  }));

  expect(schema.parse({})).toEqual({ fruit: "apple" });
  expect(schema.parse({ fruit: true })).toEqual({ fruit: "apple" });
  expect(schema.parse({ fruit: 15 })).toEqual({ fruit: "apple" });
});

test("reported issues with nested usage", () => {
  const schema = zc.compile(z.object({
    string: z.string(),
    obj: z.object({
      sub: z.object({
        lit: z.literal("a"),
        subCatch: z.number().catch(23),
      }),
      midCatch: z.number().catch(42),
    }),
    number: z.number().catch(0),
    bool: z.boolean(),
  }));

  try {
    schema.parse({
      string: {},
      obj: {
        sub: {
          lit: "b",
          subCatch: "24",
        },
        midCatch: 444,
      },
      number: "",
      bool: "yes",
    });
  } catch (error) {
    const issues = (error as zc.ZcError).issues;

    expect(issues.length).toEqual(3);
    expect(issues[0].message).toMatch("string");
    expect(issues[1].message).toMatch("literal");
    expect(issues[2].message).toMatch("boolean");
  }
});
