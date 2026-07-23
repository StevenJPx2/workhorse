// Code Mode — the Worker Loader (Dynamic Workers) tool bridge.
//
// The agent writes a TS program that chains our tools in ONE sandboxed run,
// instead of N model round-trips (the ~80% context win). The program runs in
// a disposable dynamic worker with NO network (globalOutbound: null); its only
// outside access is the TOOLS binding — a loopback to `ToolBridge` here.
//
// The stage's tool allowlist + ticket context live in `ctx.props` — platform-
// guaranteed authentic (docs: "you can trust the content of ctx.props"),
// invisible to the dynamic worker. So generated code can only call tools the
// stage was granted: the capability gate sits BELOW the model, exactly per the
// Code Mode security model (broker credentials, enforce at the proxy, code
// can't grant itself permission, control egress).

import { WorkerEntrypoint, exports as workerExports } from "cloudflare:workers";
import type { Env, WorkhorseTool } from "@workhorse/api";
import { sandboxDriver } from "./agent-run";
import { builtinTools } from "./flue-session";
import { assembleStageTools, toolContext } from "./plugins";

/** Props handed to a ToolBridge stub — authentic, never visible to the DW. */
export interface ToolBridgeProps {
  ticketId: string;
  repo: string;
  stage: string;
  selfOrigin: string;
  /** The sandbox (container) this run's tools exec against. */
  sandboxId: string;
  /** The stage's tool allowlist — the capability set. */
  allow: string[];
  /** Stage artifact dir (built-in write-gate anchor). */
  dir: string;
  /** Repo-write allowlist globs (empty = open write). */
  writeAllow: string[];
}

/**
 * Reconstruct the exact stage tool surface (built-ins ∩ allow + plugin tools ∩
 * allow) for a ToolBridge's props. Same assembly as a stage session, so a
 * run_code program sees precisely what the stage can call — no more.
 */
function stageTools(env: Env, p: ToolBridgeProps): Map<string, WorkhorseTool> {
  const allow = new Set(p.allow);
  const sandbox = sandboxDriver(env, p.sandboxId);
  const ctx = toolContext(env, p.selfOrigin, sandbox, { id: p.ticketId, repo: p.repo, stage: p.stage });
  const builtins = builtinTools(sandbox, allow, p.dir, p.writeAllow);
  const plugins = assembleStageTools(ctx, p.allow);
  const map = new Map<string, WorkhorseTool>();
  for (const t of [...builtins, ...plugins]) map.set(t.name, t);
  return map;
}

/**
 * Loopback WorkerEntrypoint the dynamic worker calls as `env.TOOLS`. Runs in
 * THIS worker (full ToolContext available); the DW only holds the stub.
 */
export class ToolBridge extends WorkerEntrypoint<Env, ToolBridgeProps> {
  /** Names of tools this run may call (the authentic props allowlist). */
  async tools(): Promise<string[]> {
    return this.ctx.props.allow ?? [];
  }

  /**
   * Invoke one tool by name with its input. Gated by the props allowlist +
   * the assembled surface, so generated code cannot escalate. Returns the
   * tool's string result (or an { error } object).
   */
  async invoke(name: string, input: unknown): Promise<unknown> {
    const p = this.ctx.props;
    if (!(p.allow ?? []).includes(name)) {
      return { error: `tool "${name}" not in this stage's allowlist`, allow: p.allow };
    }
    const tool = stageTools(this.env, p).get(name);
    if (!tool) return { error: `tool "${name}" is not available to this stage` };
    try {
      const run = tool.run as (c: { input: unknown }) => unknown | Promise<unknown>;
      return await run({ input: input ?? {} });
    } catch (e) {
      return { error: `tool "${name}" threw: ${String((e as Error)?.message ?? e).slice(0, 300)}` };
    }
  }
}

/** The loopback exports shape we rely on (default since 2025-11-17). */
interface WorkerExports {
  ToolBridge: (opts: { props: ToolBridgeProps }) => unknown;
}

export interface RunCodeResult {
  ok: boolean;
  result?: unknown;
  logs?: string[];
  error?: string;
}

/**
 * Load a dynamic worker that runs the agent's JS `code`, handing it a
 * props-scoped TOOLS bridge and NO network. The code calls
 * `env.TOOLS.invoke(name, input)` to reach stage tools; its `return` value
 * (and console.log output) come back. Uses the module-level `exports` from
 * cloudflare:workers for the loopback binding — so it works inside a
 * WorkflowEntrypoint (which has no ctx) as well as a fetch handler.
 */
export async function runCode(
  env: Env,
  props: ToolBridgeProps,
  code: string,
  args?: Record<string, string>,
): Promise<RunCodeResult> {
  const tools = (workerExports as unknown as WorkerExports).ToolBridge({ props });

  // The dynamic worker wraps the agent code in an async fn with a `tools`
  // proxy (each property → env.TOOLS.invoke), a captured console.log, and the
  // resolved `args` object (used by saved scripts as args.<name>). args are
  // string values embedded as a JSON literal — safe, deterministic.
  const wrapper = `
    export default {
      async fetch(request, env) {
        const logs = [];
        const console = { log: (...a) => logs.push(a.map(String).join(" ")), error: (...a) => logs.push("ERR " + a.map(String).join(" ")) };
        const tools = new Proxy({}, { get: (_t, name) => (input) => env.TOOLS.invoke(String(name), input) });
        const args = ${JSON.stringify(args ?? {})};
        const program = async (tools, console, args) => { ${code}\n };
        try {
          const result = await program(tools, console, args);
          return Response.json({ ok: true, result: result ?? null, logs });
        } catch (e) {
          return Response.json({ ok: false, error: String(e && e.message || e).slice(0, 800), logs });
        }
      },
    };
  `;

  const worker = env.LOADER.load({
    compatibilityDate: "2026-03-27",
    mainModule: "index.js",
    modules: { "index.js": wrapper },
    env: { TOOLS: tools },
    globalOutbound: null, // no network — tools are the only outside access
    limits: { cpuMs: 30_000, subRequests: 100 },
  });

  try {
    const res = await worker.getEntrypoint().fetch(new Request("http://dw/run"));
    return (await res.json()) as RunCodeResult;
  } catch (e) {
    return { ok: false, error: `dynamic worker failed: ${String((e as Error)?.message ?? e).slice(0, 400)}` };
  }
}
