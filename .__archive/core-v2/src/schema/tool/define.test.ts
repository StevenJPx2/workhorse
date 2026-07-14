import { createHooks } from "hookable";
import { describe, expect, it } from "vitest";
import z from "zod";

import { ResolvedConfig } from "#config";
import type { Hooks } from "#hooks";
import type { WorkflowContext } from "#workflow";

import { defineTool } from "./define";

const ctx: WorkflowContext = {
  config: ResolvedConfig.parse({}),
  cwd: "/tmp/wt",
  hooks: createHooks<Hooks>(),
};

describe("defineTool", () => {
  it("validates args against `input` before running execute", async () => {
    const tool = defineTool({
      description: "Echo a name",
      execute: ({ name }) => Promise.resolve({ ok: true, output: name }),
      input: z.object({ name: z.string() }),
      name: "echo",
    });

    await expect(tool.execute({ name: "ada" }, ctx)).resolves.toEqual({
      ok: true,
      output: "ada",
    });
  });

  it("rejects args that do not match `input`", async () => {
    const tool = defineTool({
      description: "Echo a name",
      execute: ({ name }) => Promise.resolve({ ok: true, output: name }),
      input: z.object({ name: z.string() }),
      name: "echo",
    });

    await expect(tool.execute({ name: 42 } as any, ctx)).rejects.toThrow();
  });

  it("defaults the args type to unknown when no input is given", async () => {
    const tool = defineTool({
      description: "Always ok",
      execute: () => Promise.resolve({ ok: true }),
      name: "noop",
    });

    expect(tool.input).toBeUndefined();
    await expect(tool.execute(undefined, ctx)).resolves.toEqual({ ok: true });
  });
});
