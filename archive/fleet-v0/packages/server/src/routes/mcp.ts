// MCP v2 fleet server: the fleet's operator tools as a stateless MCP endpoint.
//
// External agents (IDEs, other fleets, CI) connect to POST /mcp and get a
// curated slice of the chat-surface tools — the workhorse_* fleet verbs,
// the gh_* GitHub readers, and search_fleet_knowledge. Stateless by design
// (MCP 2026-07-28): every request builds a fresh transport + server, so no
// session state lives in the Worker; a client that wants persistence brings
// its own.
//
// Auth: master tier (the fleet bearer). The endpoint exposes WRITE verbs
// (workhorse_file_ticket), so it must never be public.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ToolContext, WorkhorseTool } from "@workhorse/api";
import type { Route, RouteCtx } from "../router";

/** Curated MCP surface — fleet ops + GitHub readers + fleet knowledge. */
const MCP_TOOL_PREFIXES = ["workhorse_", "gh_"];
const MCP_TOOL_EXACT = new Set(["search_fleet_knowledge"]);

/** Is this chat-surface tool part of the MCP surface? */
function inMcpSurface(t: WorkhorseTool): boolean {
  return MCP_TOOL_EXACT.has(t.name) || MCP_TOOL_PREFIXES.some((p) => t.name.startsWith(p));
}

/**
 * valibot-literal schema → JSON Schema (MCP inputSchema). The Workhorse tool
 * surface is authored as shallow valibot literals; the shapes in use mirror
 * the pi adapter's walk (string/number/boolean/picklist/optional/pipe/array/
 * record/object).
 */
// fallow-ignore-next-line complexity
function valibotToJsonSchema(s: Record<string, any>): Record<string, unknown> {
  switch (s?.type) {
    case "string": return { type: "string" };
    case "number": return { type: "number" };
    case "boolean": return { type: "boolean" };
    case "picklist": return { enum: s.options ?? [] };
    case "optional": return valibotToJsonSchema(s.wrapped ?? { type: "unknown" });
    case "pipe": return valibotToJsonSchema((s.pipe?.[0] ?? { type: "unknown" }) as Record<string, any>);
    case "array": return { type: "array", items: valibotToJsonSchema(s.item ?? {}) };
    case "record": return { type: "object", additionalProperties: valibotToJsonSchema(s.value ?? { type: "string" }) };
    case "object": {
      const entries = s.entries ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(entries)) {
        const vs = v as Record<string, any>;
        const wrapped = vs?.type === "pipe" ? vs.pipe?.[0] : vs;
        const optional = wrapped?.type === "optional";
        properties[k] = valibotToJsonSchema(optional ? (wrapped.wrapped ?? {}) : (wrapped ?? {}));
        if (!optional) required.push(k);
      }
      return { type: "object", properties, ...(required.length ? { required } : {}) };
    }
    default: return {};
  }
}

/** Workhorse tool → MCP tool definition. */
function toMcpTool(t: WorkhorseTool): Tool {
  return {
    name: t.name,
    description: t.description,
    inputSchema: valibotToJsonSchema(t.input as Record<string, any>) as never,
  };
}

export const mcpRoutes: Route[] = [
  {
    // MCP streamable HTTP over POST (JSON-RPC request/response). POST only:
    // GET would open an SSE stream no later request could feed, since every
    // request builds a fresh transport (stateless by design).
    method: "POST",
    path: "/mcp",
    auth: "master",
    async handler(c) {
      try {
        return await handleMcp(c);
      } catch (e) {
        // A transport crash must surface as JSON, not Cloudflare's 1101 page.
        const text = String((e as Error)?.message ?? e).slice(0, 2000);
        return new Response(JSON.stringify({ error: "mcp handler crashed", detail: text }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    },
  },
];

async function handleMcp({ request, ctx, core, env, url, assembleAllTools }: RouteCtx) {
  const selfOrigin = url.origin;
  const ctxCore = core(env, selfOrigin);
  const sandbox = (await import("@workhorse/sandbox")).sandboxDriver(env, "fleet-chat");
  const tctx: ToolContext = {
    env,
    core: ctxCore,
    selfOrigin,
    sandbox,
    ticket: { id: "mcp", repo: "", stage: "mcp" },
  };
  const tools = assembleAllTools(tctx).filter(inMcpSurface);
  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "workhorse-fleet", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(toMcpTool) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const tool = byName.get(name);
    if (!tool) {
      return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
    }
    try {
      // gh_* tools default repo to the ticket context, which MCP has none of
      // (stateless session) — require it explicitly, with a clear message.
      const args = (req.params.arguments ?? {}) as Record<string, unknown>;
      if (name.startsWith("gh_") && !args.repo) {
        return {
          content: [{ type: "text", text: `${name} requires a \`repo\` argument (owner/name) — the MCP surface has no ticket context to default from.` }],
          isError: true,
        };
      }
      const text = await tool.run({ input: args } as never);
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: String((e as Error)?.message ?? e).slice(0, 2000) }], isError: true };
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({});
  await server.connect(transport);
  const res = await transport.handleRequest(request);
  const { withSpan } = await import("@workhorse/o11y");
  return withSpan(ctx, "mcp_request", { path: "/mcp" }, async () => res);
}
