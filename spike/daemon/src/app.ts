import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

interface Env {
  FS: { read(path: string): Promise<{ status: number; text: string }> };
}

// A minimal app: one MCP tool backed by the daemon's file capability. It has no network.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "notes", version: "0.0.0" });
      server.registerTool(
        "read",
        { description: "Read a note", inputSchema: z.object({ path: z.string() }) },
        async ({ path }) => {
          const file = await env.FS.read(path);
          return { content: [{ type: "text", text: file.text }], isError: file.status !== 200 };
        },
      );
      return server;
    });
    return handler.fetch(request);
  },
};
