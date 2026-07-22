// TEMPORARY flue-migration spike probe (master-gated, additive).
//
// Answers the one question only running code can: does flue's in-process
// harness runtime + Anthropic OAuth + typed-result prompt actually execute
// on workerd? Uses an in-memory SessionEnv (no container) so it isolates
// the runtime question from sandbox wiring. Does NOT touch the pi path.
//
// DELETE once the cutover path is chosen — this is a throwaway probe.

import { getSandbox } from "@cloudflare/sandbox";
import { defineAgent, defineTool, registerProvider } from "@flue/runtime";
import { cloudflareSandbox } from "@flue/runtime/cloudflare";
import { createFlueContext, resolveModel } from "@flue/runtime/internal";
import type { SessionEnv } from "@flue/runtime";
import * as v from "valibot";
import type { Env } from "@workhorse/api";
import { json, type Route } from "../router";

/** Minimal in-memory SessionEnv: enough for a no-tool prompt (init reads cwd). */
function memEnv(): SessionEnv {
  const files = new Map<string, string | Uint8Array>();
  const dirs = new Set(["/repo"]);
  const norm = (p: string) => (p.startsWith("/") ? p : `/repo/${p}`);
  return {
    cwd: "/repo",
    resolvePath: norm,
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    readFile: async (p) => {
      const c = files.get(norm(p));
      if (c === undefined) throw new Error(`missing: ${p}`);
      return typeof c === "string" ? c : new TextDecoder().decode(c);
    },
    readFileBuffer: async (p) => {
      const c = files.get(norm(p));
      if (c === undefined) throw new Error(`missing: ${p}`);
      return typeof c === "string" ? new TextEncoder().encode(c) : c;
    },
    writeFile: async (p, c) => void files.set(norm(p), c),
    stat: async (p) => {
      const c = files.get(norm(p));
      return {
        isFile: c !== undefined,
        isDirectory: dirs.has(norm(p)),
        isSymbolicLink: false,
        size: c === undefined ? 0 : typeof c === "string" ? c.length : c.byteLength,
        mtime: new Date(0),
      };
    },
    readdir: async () => [],
    exists: async (p) => files.has(norm(p)) || dirs.has(norm(p)),
    mkdir: async (p) => void dirs.add(norm(p)),
    rm: async (p) => void files.delete(norm(p)),
  } as SessionEnv;
}

async function runProbe(env: Env, model: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  // Fresh custodian OAuth token from KV (same source as injectAuth).
  const stored = await env.TICKETS.get("auth:access");
  const token = stored ? (JSON.parse(stored) as { access: string }).access : "";
  if (!token) return { ok: false, stage: "token", error: "no auth:access in KV" };

  // pi-ai detects sk-ant-oat and applies the Claude-Code OAuth headers.
  registerProvider("anthropic", { apiKey: token });

  // A tool that closes over host state — the exact PluginToolFactory shape.
  let toolCalled = false;
  const addTool = defineTool({
    name: "add",
    description: "Add two integers. Use this for any addition.",
    input: v.object({ a: v.number(), b: v.number() }),
    run({ input }) {
      toolCalled = true;
      return { sum: input.a + input.b };
    },
  });

  const agent = defineAgent(() => ({
    model: `anthropic/${model}`,
    instructions: "You are a probe. Use the add tool for arithmetic, then answer via the result shape.",
    tools: [addTool],
  }));

  const ctx = createFlueContext({
    id: `spike-${Date.now()}`,
    env: {},
    agentConfig: { resolveModel: () => resolveModel(`anthropic/${model}`) },
    createDefaultEnv: async () => memEnv(),
  });

  // ctx-method lazily provisions in-memory conversation + attachment stores.
  const harness = await ctx.initializeRootHarness(agent);
  const session = await harness.session();
  const result = await session.prompt(
    "What is 17 + 25? Use the add tool, then report ok=true and note=<the sum>.",
    { result: v.object({ ok: v.boolean(), note: v.string() }) },
  );
  return {
    ok: true,
    elapsedMs: Date.now() - started,
    toolCalled,
    result: (result as { result?: unknown }).result ?? result,
  };
}

/**
 * The REAL stage shape: agent bound to a live container via flue's
 * cloudflareSandbox adapter. Proves the agent's tools exec in the sandbox
 * (built-in bash + our plugin tools' exec path) through flue on workerd.
 */
async function runSandboxProbe(env: Env, model: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  const stored = await env.TICKETS.get("auth:access");
  const token = stored ? (JSON.parse(stored) as { access: string }).access : "";
  if (!token) return { ok: false, stage: "token", error: "no auth:access in KV" };
  registerProvider("anthropic", { apiKey: token });

  const sandboxId = `spike-sbx-${Date.now()}`;
  const stub = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const sandboxFactory = cloudflareSandbox(stub as never);

  const agent = defineAgent(() => ({
    model: `anthropic/${model}`,
    instructions:
      "You run in a Linux container. Use the bash tool to run the command you're asked to, " +
      "then report ok=true and note=<the command's stdout, trimmed>.",
    sandbox: sandboxFactory,
  }));

  const ctx = createFlueContext({
    id: sandboxId,
    env: {},
    agentConfig: { resolveModel: () => resolveModel(`anthropic/${model}`) },
    // createDefaultEnv is unused when the agent supplies a sandbox factory,
    // but the config requires it.
    createDefaultEnv: async () => memEnv(),
  });

  const harness = await ctx.initializeRootHarness(agent);
  const session = await harness.session();
  const result = await session.prompt(
    "Run exactly: echo flue-in-container. Then report ok=true, note=<stdout>.",
    { result: v.object({ ok: v.boolean(), note: v.string() }) },
  );
  return {
    ok: true,
    elapsedMs: Date.now() - started,
    result: (result as { result?: unknown }).result ?? result,
  };
}

export const spikeRoutes: Route[] = [
  {
    method: "POST",
    path: "/spike/flue",
    auth: "master",
    async handler({ request, env }) {
      const body = (await request.json().catch(() => ({}))) as { model?: string; mode?: string };
      const model = body.model ?? "claude-haiku-4-5";
      try {
        const out = body.mode === "sandbox" ? await runSandboxProbe(env, model) : await runProbe(env, model);
        return json(out);
      } catch (e) {
        return json(
          { ok: false, stage: "run", mode: body.mode ?? "mem", error: String((e as Error)?.stack ?? e).slice(0, 2000) },
          502,
        );
      }
    },
  },
];
