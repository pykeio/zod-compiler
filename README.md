<div align="center">
  <h1>⚡ <code>zod-compiler</code> ⚡</h1>
</div>

### Speed up your Zod schemas
```ts
import z from 'zod';

const schema = z.object({
	title: z.string().min(3).max(64),
	tags: z.array(z.string()).optional(),
	...
});

// ❌ slow!
const { success, data, error } = schema.safeParse(input);

// 🚀
import zc from 'zod-compiler';
const compiledSchema = zc.compile(schema);

const { success, data, error } = compiledSchema.safeParse(input);
```

### Export your Zod schemas to TypeScript types
```ts
console.log(zc.types(schema));
// export type Schema = {
//     title: string;
//     tags?: string[];
//     ...
// };
```

## Installation
```shell
$ npm i --save zod-compiler
```

Requires **Zod 3.x** and **TypeScript 5.x** to be installed.
