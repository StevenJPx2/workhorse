import z from "zod";

import type { WorkflowContext } from "#workflow";

import type { ToolResultT } from "./result";

export const ToolAnnotations = z.object({
  destructive_hint: z.boolean().optional(),
  idempotent_hint: z.boolean().optional(),
  open_world_hint: z.boolean().optional(),
  read_only_hint: z.boolean().optional(),
  title: z.string().optional(),
});

export type ToolAnnotationsT = z.infer<typeof ToolAnnotations>;

export type ToolHandler<I = any> = (
  args: I,
  ctx: WorkflowContext,
) => Promise<ToolResultT>;

export const Tool = z.object({
  annotations: ToolAnnotations.optional(),
  description: z.string(),
  execute: z.custom<ToolHandler>((value) => typeof value === "function"),
  input: z.custom<z.ZodType>((value) => value instanceof z.ZodType).optional(),
  name: z.string(),
});

export type AnyTool = Omit<z.infer<typeof Tool>, "execute" | "input"> & {
  execute: ToolHandler<any>;
  input?: z.ZodType;
};

export type ToolT<I extends z.ZodType = z.ZodType> = Omit<
  z.infer<typeof Tool>,
  "execute" | "input"
> & {
  execute: ToolHandler<z.infer<I>>;
  input?: I;
};
