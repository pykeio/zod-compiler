import * as z from "zod";

export const crazySchema = z.object({
  tuple: z.tuple([
    z.string().nullable().optional(),
    z.number().nullable().optional(),
    z.boolean().nullable().optional(),
    z.null().nullable().optional(),
    z.undefined().nullable().optional(),
    z.literal("1234").nullable().optional(),
  ]),
  merged: z
    .object({
      k1: z.string().optional(),
    })
    .merge(z.object({ k1: z.string().nullable(), k2: z.number() })),
  union: z.array(z.union([z.literal("asdf"), z.literal(12)])).nonempty(),
  array: z.array(z.number()),
  sumMinLength: z.array(z.number()),
  intersection: z.intersection(
    z.object({ p1: z.string().optional() }),
    z.object({ p1: z.number().optional() })
  ),
  enum: z.intersection(z.enum(["zero", "one"]), z.enum(["one", "two"])),
  nonstrict: z.object({ points: z.number() }).nonstrict(),
});
