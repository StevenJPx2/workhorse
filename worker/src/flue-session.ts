// Shared flue stage-session core — the single implementation of "run one
// stage as an in-process flue harness session in the container."
//
// Used by BOTH the engine-path runner (flue-runner.ts, being retired) and the
// flue-first workflow context (workflow-run.ts). Owns: the built-in tool set
// (filtered + write-gated), the submit_work completion tool, the model
// fallback legs (Anthropic OAuth → opencode-zen free), and capacity backoff
// (short in-process retry on an all-throttled chain; a long wait is surfaced
// as `throttled` for the spine to sleep durably).

import { getSandbox } from "@cloudflare/sandbox";
import { defineAgent, defineTool, registerProvider } from "@flue/runtime";
import { cloudflareSandbox } from "@flue/runtime/cloudflare";
import { createFlueContext, resolveModel } from "@flue/runtime/internal";
import type { Env, SandboxHandle } from "@workhorse/api";
import * as v from "valibot";
import { sandboxDriver } from "./agent-run";
import { assembleStageTools, toolContext } from "./plugins";

const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Session economics captured from the flue prompt result. */
export interface SessionStats {
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost?: number;
  contextPercent?: number | null;
}

export interface StageSessionInput {
  /** Absolute stage dir; submit_work writes control.json + analysis.md here. */
  dir: string;
  /** Repo working directory in the container. */
  cwd: string;
  prompt: string;
  persona: string;
  /** Tool ceiling (bare names; includes submit_work). */
  tools: string[];
  /** Repo-write allowlist globs (empty = open write; readOnly stages pass []). */
  writeAllow: string[];
  model?: string;
  ticketId: string;
  repo: string;
  stageId: string;
}

export type StageSessionOutcome =
  | { ok: true; stats?: SessionStats }
  | { ok: false; failure: { kind: "model" | "control" | "session"; detail: string } }
  | { ok: false; throttled: { retryAfterMs: number; providers: string[]; detail: string } };

/** Minimal glob → anchored regex ('*' = non-slash, '**' = any). */
function globToRe(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${esc}$`);
}

/** Write-gate: stage dir is always writable; else match writeAllow globs. */
function writeAllowed(path: string, dir: string, writeAllow: string[]): boolean {
  if (path.startsWith(dir)) return true;
  if (writeAllow.length === 0) return true; // no policy set = open write
  const rel = path.replace(/^\/workspace\/repo\//, "");
  return writeAllow.some((g) => globToRe(g).test(path) || globToRe(g).test(rel));
}

/** Built-in tools over the SandboxHandle, filtered by the stage allowlist. */
function builtinTools(sandbox: SandboxHandle, allow: Set<string>, dir: string, writeAllow: string[]) {
  const tools = [];
  if (allow.has("read"))
    tools.push(
      defineTool({
        name: "read",
        description: "Read a file from the workspace. Returns its full text.",
        input: v.object({ path: v.string() }),
        async run({ input }) {
          const c = await sandbox.readFile(input.path);
          return c == null ? `read: file not found: ${input.path}` : c.slice(0, 100_000);
        },
      }),
    );
  if (allow.has("ls"))
    tools.push(
      defineTool({
        name: "ls",
        description: "List a directory's contents (ls -la).",
        input: v.object({ path: v.optional(v.string()) }),
        run: async ({ input }) => (await sandbox.exec(`ls -la ${q(input.path ?? ".")}`)).stdout.slice(0, 20_000),
      }),
    );
  if (allow.has("find"))
    tools.push(
      defineTool({
        name: "find",
        description: "Find files by name/glob under a path (find <path> -name <pattern>).",
        input: v.object({ pattern: v.string(), path: v.optional(v.string()) }),
        run: async ({ input }) =>
          (await sandbox.exec(`find ${q(input.path ?? ".")} -name ${q(input.pattern)} 2>/dev/null | head -200`)).stdout.slice(0, 20_000) || "(no matches)",
      }),
    );
  if (allow.has("grep"))
    tools.push(
      defineTool({
        name: "grep",
        description: "Search file contents with a regex (ripgrep-style, recursive).",
        input: v.object({ pattern: v.string(), path: v.optional(v.string()) }),
        run: async ({ input }) =>
          (await sandbox.exec(`grep -rniE ${q(input.pattern)} ${q(input.path ?? ".")} 2>/dev/null | head -200`)).stdout.slice(0, 30_000) || "(no matches)",
      }),
    );
  if (allow.has("bash"))
    tools.push(
      defineTool({
        name: "bash",
        description: "Run a shell command in the workspace root. Returns stdout+stderr (exit code on failure).",
        input: v.object({ command: v.string(), timeout: v.optional(v.number()) }),
        async run({ input }) {
          const r = await sandbox.exec(input.command, { timeout: Math.min(input.timeout ?? 120_000, 300_000) });
          const out = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(-30_000);
          return r.exitCode === 0 ? out || "(exit 0, no output)" : `exit ${r.exitCode}\n${out}`;
        },
      }),
    );
  if (allow.has("write"))
    tools.push(
      defineTool({
        name: "write",
        description: "Write (create/overwrite) a file. Subject to the stage's write policy.",
        input: v.object({ path: v.string(), content: v.string() }),
        async run({ input }) {
          if (!writeAllowed(input.path, dir, writeAllow))
            return `write blocked: ${input.path} is outside this stage's write policy (${writeAllow.join(", ") || "read-only"}).`;
          await sandbox.writeFile(input.path, input.content);
          return `wrote ${input.path} (${input.content.length} bytes)`;
        },
      }),
    );
  if (allow.has("edit"))
    tools.push(
      defineTool({
        name: "edit",
        description: "Replace an exact substring in a file (first occurrence). Subject to the write policy.",
        input: v.object({ path: v.string(), oldString: v.string(), newString: v.string() }),
        async run({ input }) {
          if (!writeAllowed(input.path, dir, writeAllow))
            return `edit blocked: ${input.path} is outside this stage's write policy (${writeAllow.join(", ") || "read-only"}).`;
          const cur = await sandbox.readFile(input.path);
          if (cur == null) return `edit: file not found: ${input.path}`;
          if (!cur.includes(input.oldString)) return `edit: oldString not found in ${input.path}`;
          await sandbox.writeFile(input.path, cur.replace(input.oldString, input.newString));
          return `edited ${input.path}`;
        },
      }),
    );
  return tools;
}

/** submit_work: the completion contract — writes analysis.md + control.json. */
function submitWorkTool(sandbox: SandboxHandle, dir: string) {
  let submitted = false;
  const tool = defineTool({
    name: "submit_work",
    description:
      "Finish this stage. Call EXACTLY ONCE with `analysis` (markdown findings/summary for the " +
      "next stage + reviewer) and `control` (a single JSON object matching the stage's contract). " +
      "Writes the stage artifacts; the run advances only after this.",
    input: v.object({ analysis: v.string(), control: v.record(v.string(), v.unknown()) }),
    async run({ input }) {
      await sandbox.writeFile(`${dir}/analysis.md`, input.analysis);
      await sandbox.writeFile(`${dir}/control.json`, JSON.stringify(input.control, null, 1));
      submitted = true;
      return "Work submitted. Stage complete.";
    },
  });
  return { tool, wasSubmitted: () => submitted };
}

/**
 * Classify a leg error:
 *   throttle — transient capacity (429/rate-limit/overloaded). Wait + retry.
 *   auth     — expired/invalid credential (401). The custodian re-pushes the
 *              OAuth token, so it's RECOVERABLE, not hard: try the next leg
 *              (different credential), and if all legs are auth/throttle,
 *              surface a wait so the spine re-invokes with a fresh token read.
 *   exhaust  — account out of credit/balance on a paid leg. Skip to next leg.
 *   hard     — a real defect (bad request, tool crash). Fail the stage.
 */
function classifyError(msg: string): "throttle" | "auth" | "exhaust" | "hard" {
  if (/429|rate.?limit|overloaded|usage.?limit/i.test(msg)) return "throttle";
  if (/401|authentication|unauthor|access token|re-?authenticate|expired/i.test(msg)) return "auth";
  if (/credit|balance|spend|quota/i.test(msg)) return "exhaust";
  return "hard";
}

/** Parse an explicit retry window (seconds) from a wrapped error string. */
function parseRetryAfterMs(msg: string): number | null {
  const m =
    msg.match(/retry[-_ ]?after["':\s]+(\d+)/i) ||
    msg.match(/"?retryAfter"?\s*[:=]\s*(\d+)/i);
  return m ? Number(m[1]) * 1000 : null;
}

// Short waits retry in-process; anything longer is surfaced for a durable
// spine sleep (an hour-long in-process setTimeout would burn the isolate).
const SHORT_WAIT_MS = 90_000;
const BACKOFF_MS = [30_000, 60_000, 90_000];

/**
 * Build a stage-session runner bound to a ticket's sandbox. Returns a
 * function that runs one stage session to completion (writing its artifacts)
 * with the model fallback chain + capacity backoff.
 */
export function makeStageSession(env: Env, sandboxId: string, selfOrigin: string) {
  const sandbox = sandboxDriver(env, sandboxId);

  return async function runStageSession(input: StageSessionInput): Promise<StageSessionOutcome> {
    const stored = await env.TICKETS.get("auth:access");
    const token = stored ? (JSON.parse(stored) as { access: string }).access : "";
    if (!token) return { ok: false, failure: { kind: "model", detail: "no OAuth token (custodian push stale?)" } };

    const allow = new Set(input.tools);
    const ctx = toolContext(env, selfOrigin, sandbox, { id: input.ticketId, repo: input.repo, stage: input.stageId });
    const builtins = builtinTools(sandbox, allow, input.dir, input.writeAllow);
    const pluginTools = assembleStageTools(ctx, input.tools);
    const primaryModel = input.model ?? "claude-sonnet-4-6";
    const zenKey = env.OPENCODE_API_KEY;

    const legs: Array<{ ref: string; provider: string; register: () => void }> = [
      { ref: `anthropic/${primaryModel}`, provider: "anthropic", register: () => registerProvider("anthropic", { apiKey: token }) },
      ...(zenKey
        ? [
            { ref: "opencode-zen/mimo-v2.5-free", provider: "opencode-zen", register: () => registerProvider("opencode-zen", { api: "openai-completions" as never, baseUrl: "https://opencode.ai/zen/v1", apiKey: zenKey }) },
            { ref: "opencode-zen/laguna-s-2.1-free", provider: "opencode-zen", register: () => registerProvider("opencode-zen", { api: "openai-completions" as never, baseUrl: "https://opencode.ai/zen/v1", apiKey: zenKey }) },
          ]
        : []),
    ];

    // One pass over the fallback legs. Returns a terminal outcome, or null to
    // signal "all legs throttled" (caller decides retry vs durable park).
    const attemptChain = async (): Promise<{ done: StageSessionOutcome } | { throttled: number; providers: string[]; detail: string; sawAuth: boolean }> => {
      let throttledMs = 0;
      const throttledProviders: string[] = [];
      let lastThrottle = "";
      let sawAuth = false;
      for (const leg of legs) {
        leg.register();
        const { tool: submit, wasSubmitted } = submitWorkTool(sandbox, input.dir);
        const agent = defineAgent(() => ({
          model: leg.ref,
          instructions: input.persona,
          tools: [...builtins, ...pluginTools, submit],
          sandbox: { ...cloudflareSandbox(getSandbox(env.Sandbox, sandboxId) as never, { cwd: input.cwd }), tools: () => [] },
        }));
        const flueCtx = createFlueContext({
          id: sandboxId,
          env: {},
          agentConfig: { resolveModel: () => resolveModel(leg.ref) },
          createDefaultEnv: async () => {
            throw new Error("no default env — stage agent supplies a sandbox factory");
          },
        });
        try {
          const harness = await flueCtx.initializeRootHarness(agent);
          const session = await harness.session();
          let res = (await session.prompt(input.prompt)) as {
            usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost?: { total?: number } };
          };
          // Weak models sometimes end the turn with prose instead of the final
          // submit_work call. Nudge in the SAME session (context intact) before
          // failing — cheaper and more reliable than re-running the stage.
          for (let nudge = 0; nudge < 2 && !wasSubmitted() && (await sandbox.readFile(`${input.dir}/control.json`)) == null; nudge++) {
            res = (await session.prompt(
              "You have not finished: call the `submit_work` tool now with your `analysis` and a `control` JSON object. Do not reply in prose — the stage only completes when submit_work is called.",
            )) as typeof res;
          }
          const stats: SessionStats | undefined = res.usage
            ? {
                tokens: { input: res.usage.input, output: res.usage.output, cacheRead: res.usage.cacheRead, cacheWrite: res.usage.cacheWrite, total: res.usage.totalTokens },
                cost: res.usage.cost?.total,
              }
            : undefined;
          if (!wasSubmitted() && (await sandbox.readFile(`${input.dir}/control.json`)) == null) {
            return { done: { ok: false, failure: { kind: "control", detail: "stage ended without calling submit_work (after nudges)" } } };
          }
          return { done: { ok: true, stats } };
        } catch (e) {
          const msg = String((e as Error)?.message ?? e);
          const kind = classifyError(msg);
          if (kind === "hard") return { done: { ok: false, failure: { kind: "session", detail: msg.slice(0, 400) } } };
          if (kind === "throttle") {
            lastThrottle = msg;
            throttledProviders.push(leg.provider);
            throttledMs = Math.max(throttledMs, parseRetryAfterMs(msg) ?? 0);
          } else if (kind === "auth") {
            // Expired/invalid credential — recoverable (custodian re-pushes
            // the token). Retrying in-process with the SAME token is futile,
            // so mark it: an all-auth/throttle chain surfaces a wait and the
            // spine re-invokes with a fresh token read.
            sawAuth = true;
            lastThrottle = msg;
            throttledProviders.push(leg.provider);
          }
          // throttle / auth / exhaust → try the next leg
        }
      }
      return { throttled: throttledMs, providers: [...new Set(throttledProviders)], detail: lastThrottle.slice(0, 200), sawAuth };
    };

    // Chain attempt + short in-process backoff; surface a long wait for the
    // spine to sleep durably.
    for (let round = 0; ; round++) {
      const r = await attemptChain();
      if ("done" in r) return r.done;
      // Auth failure: in-process retry reuses the SAME expired token and can't
      // recover — surface the wait now so the spine re-invokes with a fresh
      // token read (the custodian re-pushes auth:access out of band).
      if (r.sawAuth) {
        return { ok: false, throttled: { retryAfterMs: r.throttled || 60_000, providers: r.providers, detail: r.detail || "credential expired; awaiting custodian re-push" } };
      }
      const waitMs = r.throttled || BACKOFF_MS[Math.min(round, BACKOFF_MS.length - 1)];
      if (waitMs > SHORT_WAIT_MS || round >= BACKOFF_MS.length) {
        return { ok: false, throttled: { retryAfterMs: waitMs, providers: r.providers, detail: r.detail || "all model providers throttled" } };
      }
      await new Promise((res) => setTimeout(res, waitMs));
    }
  };
}
