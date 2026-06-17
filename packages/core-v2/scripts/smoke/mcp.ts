#!/usr/bin/env bun
/**
 * McpService smoke.
 *
 *   bun scripts/smoke/mcp.ts
 */
import { fileURLToPath } from "node:url";

import { McpService } from "#services";

import { context, narrator, sandbox, toolSink } from "./harness";

export async function mcpSmoke(): Promise<void> {
  const out = narrator("McpService");
  const box = sandbox();

  try {
    const ctx = context(box.cwd);
    const tools = toolSink(ctx);
    const service = new McpService([
      {
        args: [
          fileURLToPath(
            import.meta.resolve("../../src/services/mcp/__tests__/server.ts"),
          ),
        ],
        command: "bun",
        name: "mock",
      },
    ]);

    await service.setup(ctx);
    out.step(`setup connected ${service.list().length} MCP server(s)`);
    out.detail("contributed tools", [...tools.keys()]);

    const echo = tools.get("mcp:mock:echo");
    out.step('execute mcp:mock:echo { message: "smoke" }');
    out.detail("echo result", await echo?.execute({ message: "smoke" }, ctx));

    service.teardown();
    out.done(
      `${service.name}: connect → list tools → register → execute → teardown`,
    );
  } finally {
    box.dispose();
  }
}

if (import.meta.main) {
  await mcpSmoke();
}
