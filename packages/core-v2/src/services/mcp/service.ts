import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import z from "zod";

import type { GlobalContext } from "#orchestrator";
import { type AnyTool, defineTool, type McpServerConfigT } from "#schema";

import type { Service } from "../base";
import type { McpToolT } from "./schema";

export class McpService implements Service {
  readonly name = "mcp";

  private readonly clients = new Map<string, Client>();
  private readonly initialServers: McpServerConfigT[];

  constructor(servers: McpServerConfigT[] = []) {
    this.initialServers = servers;
  }

  async setup(context: GlobalContext): Promise<void> {
    await context.hooks.callHook("tools:register", {
      tools: await Promise.all(
        this.initialServers.map((server) => this.addServer(server)),
      ).then((results) => results.flat()),
    });

    context.hooks.hook("mcp:register", async ({ server }) => {
      await context.hooks.callHook("tools:register", {
        tools: await this.addServer(server),
      });
    });
  }

  list(): readonly McpServerConfigT[] {
    return this.initialServers;
  }

  teardown(): void {
    for (const client of this.clients.values()) {
      void client.close();
    }
    this.clients.clear();
  }

  private async addServer(config: McpServerConfigT): Promise<AnyTool[]> {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP server "${config.name}" is already registered.`);
    }

    const transport = new StdioClientTransport({
      args: config.args,
      command: config.command,
      env: config.env,
      stderr: "pipe",
    });

    transport.stderr?.on("data", (chunk: Buffer) => {
      console.error(`[mcp ${config.name}] ${chunk.toString("utf8")}`);
    });

    const client = new Client(
      { name: "workhorse", version: "0.1.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    this.clients.set(config.name, client);

    return this.toolsForClient(client, config.name);
  }

  private async toolsForClient(
    client: Client,
    serverName: string,
  ): Promise<AnyTool[]> {
    const tools: AnyTool[] = [];

    for (const mcpTool of await client
      .listTools()
      .then((toolsResult) => toolsResult.tools as McpToolT[])) {
      const input = mcpTool.inputSchema
        ? z.fromJSONSchema(
            mcpTool.inputSchema as Parameters<typeof z.fromJSONSchema>[0],
          )
        : undefined;
      const name = `mcp:${serverName}:${mcpTool.name}`;

      tools.push(
        defineTool({
          annotations: {
            destructive_hint: true,
            idempotent_hint: false,
            open_world_hint: true,
            read_only_hint: false,
            title: mcpTool.name,
          },
          description: `${mcpTool.description ?? `MCP tool ${mcpTool.name}`} (via MCP server "${serverName}").`,
          execute: async (args) => {
            try {
              const result = await client.callTool({
                arguments: args as Record<string, unknown>,
                name: mcpTool.name,
              });

              return { ok: true, output: JSON.stringify(result, undefined, 2) };
            } catch (error) {
              return {
                error: error instanceof Error ? error.message : String(error),
                ok: false,
              };
            }
          },
          input,
          name,
        }),
      );
    }

    return tools;
  }
}
