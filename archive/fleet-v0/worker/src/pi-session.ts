// pi stage-session core — the single implementation of "run one stage as an
// in-process pi (pi-coding-agent SDK) session in the worker."
//
// Replaces the flue harness (worker/src/flue-session.ts, deleted): the agent
// loop is pi's own createAgentSession — one session per stage, in-memory
// managers, custom tools = the Workhorse stage surface (plugin tools +
// engine tools + submit_work) adapted from valibot schemas to typebox.
// Owns: the tool set (filtered + write-gated), the submit_work completion
// tool, the ONE model plane (opencode-go, flat-rate subscription), usage
// accumulation from pi events, and capacity backoff (short in-process
// retry on throttle; a long wait is surfaced as `throttled` for the spine
// to sleep durably).
//
// Bundle note: the worker is built with worker/pi-build.mjs (see
// worker/pi-workerd/README.md) — pi's graph needs node builtins external,
// an import.meta.url define, and stubs for child_process/jiti/pi-tui/
// proper-lockfile/hosted-git-info/undici plus a runtime typebox/compile
// shim (workerd forbids the codegen typebox's TypeCompiler uses).

import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { piSession, toPiTool, writeGateExtension } from "@workhorse/pi";
import type { Env, SandboxHandle, WorkhorseTool } from "@workhorse/api";
import type { RunCodeResult, ToolBridgeProps } from "@workhorse/sandbox";
import { sandboxDriver } from "@workhorse/sandbox";
import { assembleStageExtensions, assembleStageTools } from "./registry";
import { coreFor } from "./core";
import { toolContext } from "@workhorse/server";

/** Format a Code Mode run result (shared by run_code + run_script). */
// fallow-ignore-next-line complexity
function fmtCodeResult(label: string, r: RunCodeResult): string {
  const logs = r.logs?.length ? `\n\n--- logs ---\n${r.logs.join("\n")}` : "";
  if (!r.ok) return `${label} error: ${r.error}${logs}`;
  const val = typeof r.result === "string" ? r.result : JSON.stringify(r.result, null, 1);
  return `${label} result:\n${val}${logs}`;
}

/** Session economics captured from the pi session events. */
interface SessionStats {
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost?: number;
  contextPercent?: number | null;
  /** Code Mode adoption signal: run_code + run_script invocations this stage. */
  runCodeCalls?: number;
}

interface StageSessionInput {
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

type StageSessionOutcome =
  | { ok: true; stats?: SessionStats }
  | { ok: false; failure: { kind: "model" | "control" | "session"; detail: string } }
  | { ok: false; throttled: { retryAfterMs: number; providers: string[]; detail: string } };

/** valibot schema → TS type string (shallow; enough for a tool signature). */
// fallow-ignore-next-line complexity
function tsType(s: { type?: string; wrapped?: unknown; options?: unknown[]; item?: unknown; value?: unknown }): string {
  switch (s?.type) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "picklist": return (s.options ?? []).map((o) => JSON.stringify(o)).join(" | ") || "string";
    case "array": return `${tsType((s.item as never) ?? {})}[]`;
    case "optional": return tsType((s.wrapped as never) ?? {});
    case "record": return `Record<string, ${tsType((s.value as never) ?? { type: "string" })}>`;
    case "object": return "object";
    default: return "unknown";
  }
}

/**
 * Generate the typed `tools` API surface for run_code's prompt — one line per
 * tool: `name(input: { field: type }): Promise<string>  // description`.
 */
function toolSurface(tools: WorkhorseTool[], allow: string[]): string {
  const allowed = new Set(allow);
  return tools
    .filter((t) => allowed.has(t.name))
    .map((t) => {
      const entries = ((t.input as { entries?: Record<string, { type?: string }> })?.entries) ?? {};
      const fields = Object.entries(entries)
        .map(([k, s]) => `${k}${s?.type === "optional" ? "?" : ""}: ${tsType(s as never)}`)
        .join("; ");
      return `  ${t.name}(input: { ${fields} }): Promise<string>;  // ${t.description.slice(0, 90)}`;
    })
    .join("\n");
}

/** submit_work: the completion contract — writes analysis.md + control.json. */
function submitWorkTool(sandbox: SandboxHandle, dir: string): WorkhorseTool & { wasSubmitted(): boolean } {
  let submitted = false;
  const tool = {
    name: "submit_work",
    description:
      "Finish this stage. Call EXACTLY ONCE with `analysis` (markdown findings/summary for the " +
      "next stage + reviewer) and `control` (a single JSON object matching the stage's contract). " +
      "Writes the stage artifacts; the run advances only after this.",
    input: {
      type: "object",
      entries: { analysis: { type: "string" }, control: { type: "record", value: { type: "unknown" } } },
    },
    async run({ input }: { input: { analysis: string; control: Record<string, unknown> } }) {
      await sandbox.writeFile(`${dir}/analysis.md`, input.analysis);
      await sandbox.writeFile(`${dir}/control.json`, JSON.stringify(input.control, null, 1));
      submitted = true;
      return "Work submitted. Stage complete.";
    },
  } as WorkhorseTool;
  return Object.assign(tool, { wasSubmitted: () => submitted });
}

/**
 * Classify a leg error:
 *   throttle — transient capacity (429/rate-limit/overloaded). Wait + retry.
 *   auth     — expired/invalid credential (401). With a static subscription
 *              key this is a CONFIG defect, not a transient: fail the stage.
 *   exhaust  — account out of credit/balance on a paid leg. Park (credit may
 *              reset) rather than fail.
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
 * with the pi agent loop + capacity backoff.
 */
export function makeStageSession(env: Env, sandboxId: string, selfOrigin: string) {
  const sandbox = sandboxDriver(env, sandboxId);

  // fallow-ignore-next-line complexity
  return async function runStageSession(input: StageSessionInput): Promise<StageSessionOutcome> {
    const apiKey = env.OPENCODE_API_KEY;
    if (!apiKey) {
      return { ok: false, failure: { kind: "model", detail: "OPENCODE_API_KEY not set" } };
    }

    const allow = new Set(input.tools);
    const ctx = toolContext(env, coreFor(env, selfOrigin), selfOrigin, sandbox, { id: input.ticketId, repo: input.repo, stage: input.stageId }, { dir: input.dir, writeAllow: input.writeAllow });
    const pluginTools = assembleStageTools(ctx, input.tools);
    // Code Mode verbs stay ENGINE builtins: they run through the bridge, which
    // needs this stage's authentic props — a plugin ToolContext cannot reach them.
    const engineTools: WorkhorseTool[] = [];
    let runCodeCalls = 0;

    const bridgeAllow = input.tools.filter(
      (t) => t !== "run_code" && t !== "run_script" && t !== "submit_work",
    );
    const bridgeProps: ToolBridgeProps = {
      ticketId: input.ticketId,
      repo: input.repo,
      stage: input.stageId,
      selfOrigin,
      sandboxId,
      allow: bridgeAllow,
      dir: input.dir,
      writeAllow: input.writeAllow,
    };

    if (allow.has("run_code")) {
      const surface = toolSurface(pluginTools, bridgeAllow);
      engineTools.push({
        name: "run_code",
        description:
          "Run a TypeScript/JavaScript program that CHAINS this stage's tools in one sandboxed run — " +
          "read several files, grep, run commands, filter/transform results — without a model round-trip " +
          "per call. Call tools as `await tools.<name>(input)` (each resolves to the tool's string result); " +
          "`console.log(...)` is captured; end with `return <value>`. Runs in an isolated dynamic worker " +
          "with NO network — only these tools reach out:\n" +
          `declare const tools: {\n${surface || "  // (no tools available)"}\n};`,
        input: { type: "object", entries: { code: { type: "string" } } },
        async run({ input: a }: { input: { code: string } }) {
          runCodeCalls++;
          const { runCode } = await import("@workhorse/sandbox");
          return fmtCodeResult("run_code", await runCode(env, bridgeProps, a.code));
        },
      } as WorkhorseTool);
    }

    if (allow.has("run_script")) {
      engineTools.push({
        name: "run_script",
        description:
          "Run a registered script by name (see list_scripts) — a saved Code Mode program that chains " +
          "this stage's tools deterministically, no fresh reasoning. Pass args as key/value pairs (all " +
          "string values); they reach the program as the `args` object. Returns its result + logs.",
        input: {
          type: "object",
          entries: { name: { type: "string" }, args: { type: "optional", wrapped: { type: "record", value: { type: "string" } } } },
        },
        // fallow-ignore-next-line complexity
        async run({ input: a }: { input: { name: string; args?: Record<string, string> } }) {
          runCodeCalls++;
          const script = await ctx.core.getScriptByName(a.name, input.repo || undefined);
          if (!script) return `run_script: no script named "${a.name}". Use list_scripts.`;
          // Gate against the ticket's LIVE status (not stale sandbox state).
          if (script.statusGates.length) {
            const t = await ctx.core.getTicket(input.ticketId);
            const status = t?.status;
            if (status && !script.statusGates.includes(status)) {
              return `run_script: "${script.name}" is gated to [${script.statusGates.join(", ")}]; ticket status is ${status}.`;
            }
          }
          for (const arg of script.args) {
            if (arg.required && !(a.args ?? {})[arg.name]) {
              return `run_script: missing required arg "${arg.name}" (${arg.description ?? ""})`;
            }
          }
          const { runCode } = await import("@workhorse/sandbox");
          return fmtCodeResult(
            `run_script "${script.name}"`,
            await runCode(env, bridgeProps, script.code, a.args ?? {}),
          );
        },
      } as WorkhorseTool);
    }

    const primaryModel = input.model ?? "deepseek-v4-flash";

    // ONE model plane: opencode-go (flat-rate subscription) through pi-ai's
    // builtin catalog. No fallback legs — a subscription key is static, so
    // 401 is a config defect (fail the stage, don't wait for a re-push), and
    // throttling is handled by the backoff loop below.
    const submit = submitWorkTool(sandbox, input.dir);
    const piTools = [...pluginTools, ...engineTools, submit].map(toPiTool);
    const toolNames = piTools.map((t) => t.name);

    // Plugin extensions + the call-time allowlist gate (defense in depth:
    // the session's active tool set is the allowlist, and the gate re-checks
    // every call at execution time so nothing assembled mid-session slips).
    const extensions = [...assembleStageExtensions(ctx), writeGateExtension(new Set(toolNames))];

    // One attempt = one pi session (fresh context per retry round).
    // fallow-ignore-next-line complexity
    const attempt = async (): Promise<StageSessionOutcome> => {
      let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
      try {
        session = await piSession({
          apiKey,
          persona: input.persona ?? "",
          modelName: primaryModel,
          customTools: piTools,
          tools: toolNames,
          extensions,
        });

        // Accumulate usage from assistant message ends (pi emits one per turn).
        const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
        // fallow-ignore-next-line complexity
        session.subscribe((event: { type: string; message?: { role?: string; usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } } } }) => {
          if (event.type === "message_end" && event.message?.role === "assistant" && event.message.usage) {
            const u = event.message.usage;
            usage.input += u.input ?? 0;
            usage.output += u.output ?? 0;
            usage.cacheRead += u.cacheRead ?? 0;
            usage.cacheWrite += u.cacheWrite ?? 0;
            usage.cost += u.cost?.total ?? 0;
          }
        });

        await session.prompt(input.prompt);
        // Weak models sometimes end the turn with prose instead of the final
        // submit_work call. Nudge in the SAME session (context intact) before
        // failing — cheaper and more reliable than re-running the stage.
        for (let nudge = 0; nudge < 2 && !submit.wasSubmitted() && (await sandbox.readFile(`${input.dir}/control.json`)) == null; nudge++) {
          await session.prompt(
            "You have not finished: call the `submit_work` tool now with your `analysis` and a `control` JSON object. Do not reply in prose — the stage only completes when submit_work is called.",
          );
        }

        const stats: SessionStats = usage.input || usage.output
          ? {
              tokens: {
                input: usage.input,
                output: usage.output,
                cacheRead: usage.cacheRead,
                cacheWrite: usage.cacheWrite,
                total: usage.input + usage.output + usage.cacheRead + usage.cacheWrite,
              },
              cost: usage.cost,
              runCodeCalls,
            }
          : { runCodeCalls };

        if (!submit.wasSubmitted() && (await sandbox.readFile(`${input.dir}/control.json`)) == null) {
          return {
            ok: false,
            failure: {
              kind: "control",
              detail: `stage ended without submit_work (after nudges); model=${primaryModel}`,
            },
          };
        }
        return { ok: true, stats };
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        const kind = classifyError(msg);
        if (kind === "hard") return { ok: false, failure: { kind: "session", detail: msg.slice(0, 400) } };
        if (kind === "auth") {
          // A static subscription key can't heal by waiting — fail the stage.
          return { ok: false, failure: { kind: "model", detail: `model auth failed (check OPENCODE_API_KEY): ${msg.slice(0, 200)}` } };
        }
        // throttle / exhaust → park: the spine sleeps durably and re-invokes.
        return {
          ok: false,
          throttled: { retryAfterMs: parseRetryAfterMs(msg) ?? 0, providers: ["opencode-go"], detail: msg.slice(0, 200) },
        };
      } finally {
        session?.dispose();
      }
    };

    // Attempt + short in-process backoff; surface a long wait for the spine.
    for (let round = 0; ; round++) {
      const r = await attempt();
      if (r.ok || !("throttled" in r)) return r;
      const waitMs = r.throttled.retryAfterMs || BACKOFF_MS[Math.min(round, BACKOFF_MS.length - 1)];
      if (r.throttled.retryAfterMs > SHORT_WAIT_MS || round >= BACKOFF_MS.length) {
        // Keep a nonzero backoff on the surfaced park (0 would retry at the
        // spine's minimum interval while the provider stays down).
        return { ...r, throttled: { ...r.throttled, retryAfterMs: waitMs } };
      }
      await new Promise((res) => setTimeout(res, waitMs));
    }
  };
}
