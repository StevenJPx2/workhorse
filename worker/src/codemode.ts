// Code Mode — the Worker Loader (Dynamic Workers) tool bridge.
//
// The agent writes a TS program that chains our tools in ONE sandboxed run,
// instead of N model round-trips. The program runs in a disposable dynamic
// worker with NO network (globalOutbound: null); its only outside access is
// the TOOLS binding — a loopback to `ToolBridge` here. The stage's tool
// allowlist + ticket context live in `ctx.props` (platform-guaranteed
// authentic, invisible to the dynamic worker), so generated code can only
// call tools the stage was granted — the capability gate enforced BELOW the
// model, exactly per the Code Mode security model.

import { WorkerEntrypoint } from "cloudflare:workers";
import type { Env } from "@workhorse/api";

/** Props handed to a ToolBridge stub — authentic, never visible to the DW. */
export interface ToolBridgeProps {
  ticketId: string;
  repo: string;
  stage: string;
  selfOrigin: string;
  /** The stage's tool allowlist — the capability set. */
  allow: string[];
  /** Spike-only marker to prove props are readable server-side. */
  marker?: string;
}

/**
 * Loopback WorkerEntrypoint the dynamic worker calls as `env.TOOLS.invoke()`.
 * Runs in THIS worker (full ToolContext available); the DW only holds the stub.
 */
export class ToolBridge extends WorkerEntrypoint<Env, ToolBridgeProps> {
  /** Names of tools this run may call (from the authentic props allowlist). */
  async tools(): Promise<string[]> {
    return this.ctx.props.allow ?? [];
  }

  /**
   * Invoke one tool by name with its input. Gated by the props allowlist —
   * a name outside it is rejected here, so generated code cannot escalate.
   * (Spike: echoes rather than running the real ToolFactory — the real
   * invoke lands once the mechanism is proven.)
   */
  async invoke(name: string, input: unknown): Promise<unknown> {
    const allow = this.ctx.props.allow ?? [];
    if (!allow.includes(name)) {
      return { error: `tool "${name}" not in this stage's allowlist`, allow };
    }
    // SPIKE: prove the round-trip + props authenticity. Real impl runs
    // assembleStageTools(ctx) ∩ allow → factory(toolContext).run(input).
    return { ok: true, name, input, ranAsProp: this.ctx.props.marker ?? null };
  }
}

/** ctx.exports shape we rely on (enable_ctx_exports compat flag). */
interface CtxExports {
  exports: { ToolBridge: (opts: { props: ToolBridgeProps }) => unknown };
}

/**
 * Spike: prove the whole Code Mode mechanism end-to-end on the live worker —
 * load() a dynamic worker, hand it a props-scoped TOOLS binding, block egress,
 * and confirm (1) an allowed tool call returns, (2) a disallowed one is gated,
 * (3) props are invisible to the DW, (4) network is blocked.
 */
export async function runLoaderSpike(env: Env, ctx: ExecutionContext): Promise<unknown> {
  const props: ToolBridgeProps = {
    ticketId: "spike",
    repo: "",
    stage: "spike",
    selfOrigin: env.SELF_URL ?? "",
    allow: ["web_search"],
    marker: "prop-visible-server-side",
  };
  const tools = (ctx as unknown as CtxExports).exports.ToolBridge({ props });

  const code = `
    export default {
      async fetch(request, env) {
        const out = {};
        // (1) allowed tool call round-trips through the bridge
        out.allowed = await env.TOOLS.invoke("web_search", { query: "hello" });
        // (2) disallowed tool is gated below the model
        out.disallowed = await env.TOOLS.invoke("bash", { command: "rm -rf /" });
        // (3) the DW cannot see the bridge's props (only method results)
        out.propsVisible = typeof env.MARKER !== "undefined";
        // (4) egress is blocked (globalOutbound: null)
        try { await fetch("https://example.com"); out.egress = "REACHED"; }
        catch (e) { out.egress = "blocked: " + String(e).slice(0, 60); }
        return Response.json(out);
      },
    };
  `;

  const worker = env.LOADER.load({
    compatibilityDate: "2026-03-27",
    mainModule: "index.js",
    modules: { "index.js": code },
    env: { TOOLS: tools },
    globalOutbound: null,
    limits: { cpuMs: 5_000, subRequests: 20 },
  });

  const res = await worker.getEntrypoint().fetch(new Request("http://dw/run"));
  return await res.json();
}
