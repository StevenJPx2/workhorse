import z from "zod";

export const McpToolSchema = z.object({
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  name: z.string(),
});

export type McpToolT = z.infer<typeof McpToolSchema>;

export const McpToolResult = z.object({
  content: z.array(z.record(z.string(), z.unknown())).optional(),
  error: z.string().optional(),
  isError: z.boolean().optional(),
});

export type McpToolResultT = z.infer<typeof McpToolResult>;
