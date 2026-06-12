import type z from "zod";

import { Tool, type ToolT } from "./schema";

export function defineTool<I extends z.ZodType = z.ZodType>(spec: ToolT<I>) {
  const { execute, input, ...rest } = spec;

  return Tool.parse({
    ...rest,

    execute: async (args, ctx) => {
      let parsed = args;

      if (input !== undefined) {
        parsed = input.parse(args);
      }

      return await execute(parsed as z.infer<I>, ctx);
    },

    input,
  } as ToolT<I>) as ToolT<I>;
}
