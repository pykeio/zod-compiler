// @ts-ignore TS6133
import { assert, expect, test } from 'vitest';

import * as z from 'zod';
import * as zc from '../src/index.ts';

test("nativeEnum test with consts", () => {
	const Fruits: { Apple: "apple"; Banana: "banana" } = {
		Apple: "apple",
		Banana: "banana",
	};
	const fruitEnum = zc.compile(z.nativeEnum(Fruits));
	fruitEnum.parse("apple");
	fruitEnum.parse("banana");
	fruitEnum.parse(Fruits.Apple);
	fruitEnum.parse(Fruits.Banana);
});

test("nativeEnum test with real enum", () => {
	enum Fruits {
		Apple = "apple",
		Banana = "banana",
	}
	// @ts-ignore
	const fruitEnum = zc.compile(z.nativeEnum(Fruits));
	fruitEnum.parse("apple");
	fruitEnum.parse("banana");
	fruitEnum.parse(Fruits.Apple);
	fruitEnum.parse(Fruits.Banana);
});

test("nativeEnum test with const with numeric keys", () => {
	const FruitValues = {
		Apple: 10,
		Banana: 20,
		// @ts-ignore
	} as const;
	const fruitEnum = zc.compile(z.nativeEnum(FruitValues));
	fruitEnum.parse(10);
	fruitEnum.parse(20);
	fruitEnum.parse(FruitValues.Apple);
	fruitEnum.parse(FruitValues.Banana);
});

test("from enum", () => {
	enum Fruits {
		Cantaloupe,
		Apple = "apple",
		Banana = "banana",
	}

	const FruitEnum = zc.compile(z.nativeEnum(Fruits as any));
	FruitEnum.parse(Fruits.Cantaloupe);
	FruitEnum.parse(Fruits.Apple);
	FruitEnum.parse("apple");
	FruitEnum.parse(0);
	expect(() => FruitEnum.parse(1)).toThrow();
	expect(() => FruitEnum.parse("Apple")).toThrow();
	expect(() => FruitEnum.parse("Cantaloupe")).toThrow();
});

test("from const", () => {
	const Greek = {
		Alpha: "a",
		Beta: "b",
		Gamma: 3,
		// @ts-ignore
	} as const;

	const GreekEnum = zc.compile(z.nativeEnum(Greek));
	GreekEnum.parse("a");
	GreekEnum.parse("b");
	GreekEnum.parse(3);
	expect(() => GreekEnum.parse("v")).toThrow();
	expect(() => GreekEnum.parse("Alpha")).toThrow();
	expect(() => GreekEnum.parse(2)).toThrow();
});
