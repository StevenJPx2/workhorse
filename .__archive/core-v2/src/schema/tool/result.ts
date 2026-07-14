import z from "zod";

export const ToolResult = z.object({
  error: z.string().optional(),
  ok: z.boolean(),
  output: z.string().optional(),
});

export type ToolResultT = z.infer<typeof ToolResult>;
