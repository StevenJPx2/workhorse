import z from "zod";

export const McpServerConfig = z.object({
  args: z.array(z.string()).default([]),
  command: z.string(),
  env: z.record(z.string(), z.string()).optional(),
  name: z.string(),
});

export type McpServerConfigT = z.infer<typeof McpServerConfig>;
