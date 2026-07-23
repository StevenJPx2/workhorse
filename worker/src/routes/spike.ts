// TEMPORARY model probe (master-gated, additive). Answers the one question
// only running code can: does a candidate fallback model actually drive
// TOOL-CALLING + a typed result through our flue path — or does it 429 /
// return empty like the weak free models did? Delete once a fallback leg is
// wired + proven.

import { defineAgent, defineTool, registerProvider } from "@flue/runtime";
import type { SessionEnv } from "@flue/runtime";
import { createFlueContext, resolveModel } from "@flue/runtime/internal";
import * as v from "valibot";
import type { Env } from "@workhorse/api";
import { json, type Route } from "../router";

/** Minimal in-memory SessionEnv — enough for a no-container tool prompt. */
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

async function probeModel(env: Env, ref: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  const key = env.OPENCODE_API_KEY;
  if (!key) return { ok: false, stage: "config", error: "OPENCODE_API_KEY unset" };

  // opencode-zen custom provider — OpenAI-compatible endpoint (docs: the
  // SDK appends /chat/completions to baseUrl).
  registerProvider("opencode-zen", {
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/v1",
    apiKey: key,
  });

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
    model: ref,
    instructions: "You are a probe. Use the add tool for arithmetic, then answer via the result shape.",
    tools: [addTool],
  }));

  const ctx = createFlueContext({
    id: `probe-${Date.now()}`,
    env: {},
    agentConfig: { resolveModel: () => resolveModel(ref) },
    createDefaultEnv: async () => memEnv(),
  });

  const harness = await ctx.initializeRootHarness(agent);
  const session = await harness.session();
  const result = await session.prompt(
    "What is 17 + 25? Use the add tool, then report ok=true and note=<the sum>.",
    { result: v.object({ ok: v.boolean(), note: v.string() }) },
  );
  return {
    ok: true,
    ref,
    elapsedMs: Date.now() - started,
    toolCalled,
    result: (result as { result?: unknown; text?: unknown }).result ?? (result as { text?: unknown }).text ?? result,
  };
}

export const spikeRoutes: Route[] = [
  {
    // Probe a candidate model's tool-calling via our flue path. Body: { model }.
    method: "POST",
    path: "/spike/model",
    auth: "master",
    async handler({ request, env }) {
      const body = (await request.json().catch(() => ({}))) as { model?: string };
      const ref = body.model ?? "opencode-zen/deepseek-v4-flash-free";
      try {
        return json(await probeModel(env, ref));
      } catch (e) {
        return json({ ok: false, ref, error: String((e as Error)?.message ?? e).slice(0, 600) }, 500);
      }
    },
  },
];
