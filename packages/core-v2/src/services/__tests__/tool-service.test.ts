import { describe, expect, it } from "vitest";

import { defineTool } from "#schema";

import { ToolService } from "../tool";
import { context } from "./fixture";

const gitCommit = defineTool({
  description: "Commit staged changes",
  execute: async () => ({ ok: true }),
  name: "git_commit",
});

describe("ToolService", () => {
  it("keeps a tool registered over the hook bus", async () => {
    const ctx = context();
    const tools = new ToolService();
    tools.setup(ctx);

    await ctx.hooks.callHook("tools:register", { tool: gitCommit });

    expect(tools.list()).toHaveLength(1);
    expect(tools.list()[0]?.name).toBe("git_commit");
  });
});
