// Flue-backed StageRunner (the FLUE_STAGES path).
//
// Runs one workflow stage as an in-process flue harness session inside the
// worker (agent loop in the Worker, container is hands — every tool call is
// a sandbox RPC). Proven viable by the 3 live spike probes (memory #232).
//
// The engine's contract is unchanged: this runner writes control.json +
// analysis.md into the stage dir (via a submit_work flue tool), and the
// engine's collectStage/route/loop machinery consumes them exactly as the
// pi path. So all workflow semantics stay in the engine; only HOW a stage
// session runs changes.
//
// Tool assembly (the gating that makes read-only stages real):
//   - flue's DEFAULT built-ins are SUPPRESSED (sandbox factory tools: []),
//     because SandboxFactory.tools replaces them wholesale and flue doesn't
//     export a filter — a read-only stage would otherwise get write/bash.
//   - we provide read/ls/find/grep/bash/write/edit as our OWN flue tools,
//     included only when the stage allowlist names them; write/edit are
//     writeAllow-glob-gated (making writeAllow a real mechanical gate).
//   - plugin tools come from assembleStageTools(ctx, allow) (same gate).
//   - submit_work writes the two artifacts.
// Everything is one shape (flue defineTool closing over the SandboxHandle).
//
// Known cut-1 gaps (tracked): Magic Context tools (ctx_search/ctx_memory)
// are Pi extensions with no flue equivalent yet — they're spec-optional, so
// unknown allowlist names are skipped. Conversation persistence for the
// live-output pane is not wired here yet (engine still reads events for the
// pi path; flue stages report via stats + analysis).

import { getSandbox } from "@cloudflare/sandbox";
import { defineAgent, defineTool, registerProvider } from "@flue/runtime";
import { cloudflareSandbox } from "@flue/runtime/cloudflare";
import { createFlueContext, resolveModel } from "@flue/runtime/internal";
import type { SandboxHandle } from "@workhorse/api";
import type { StageRunInput, StageRunResult, StageRunner } from "@workhorse/workflow";
import * as v from "valibot";
import type { Env } from "@workhorse/api";
import { sandboxDriver } from "./agent-run";
import { assembleStageTools, coreFor, toolContext } from "./plugins";

const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
const BUILTINS = new Set(["read", "ls", "find", "grep", "bash", "write", "edit"]);

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

/** Our built-in tools over the SandboxHandle, filtered by the allowlist. */
function builtinTools(sandbox: SandboxHandle, allow: Set<string>, dir: string, writeAllow: string[]) {
  const tools = [];
  if (allow.has("read")) {
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
  }
  if (allow.has("ls")) {
    tools.push(
      defineTool({
        name: "ls",
        description: "List a directory's contents (ls -la).",
        input: v.object({ path: v.optional(v.string()) }),
        run: async ({ input }) => (await sandbox.exec(`ls -la ${q(input.path ?? ".")}`)).stdout.slice(0, 20_000),
      }),
    );
  }
  if (allow.has("find")) {
    tools.push(
      defineTool({
        name: "find",
        description: "Find files by name/glob under a path (find <path> -name <pattern>).",
        input: v.object({ pattern: v.string(), path: v.optional(v.string()) }),
        run: async ({ input }) =>
          (await sandbox.exec(`find ${q(input.path ?? ".")} -name ${q(input.pattern)} 2>/dev/null | head -200`)).stdout.slice(0, 20_000) || "(no matches)",
      }),
    );
  }
  if (allow.has("grep")) {
    tools.push(
      defineTool({
        name: "grep",
        description: "Search file contents with a regex (ripgrep-style, recursive).",
        input: v.object({ pattern: v.string(), path: v.optional(v.string()) }),
        run: async ({ input }) =>
          (await sandbox.exec(`grep -rniE ${q(input.pattern)} ${q(input.path ?? ".")} 2>/dev/null | head -200`)).stdout.slice(0, 30_000) || "(no matches)",
      }),
    );
  }
  if (allow.has("bash")) {
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
  }
  if (allow.has("write")) {
    tools.push(
      defineTool({
        name: "write",
        description: "Write (create/overwrite) a file. Subject to the stage's write policy.",
        input: v.object({ path: v.string(), content: v.string() }),
        async run({ input }) {
          if (!writeAllowed(input.path, dir, writeAllow)) {
            return `write blocked: ${input.path} is outside this stage's write policy (${writeAllow.join(", ") || "read-only"}).`;
          }
          await sandbox.writeFile(input.path, input.content);
          return `wrote ${input.path} (${input.content.length} bytes)`;
        },
      }),
    );
  }
  if (allow.has("edit")) {
    tools.push(
      defineTool({
        name: "edit",
        description: "Replace an exact substring in a file (first occurrence). Subject to the write policy.",
        input: v.object({ path: v.string(), oldString: v.string(), newString: v.string() }),
        async run({ input }) {
          if (!writeAllowed(input.path, dir, writeAllow)) {
            return `edit blocked: ${input.path} is outside this stage's write policy (${writeAllow.join(", ") || "read-only"}).`;
          }
          const cur = await sandbox.readFile(input.path);
          if (cur == null) return `edit: file not found: ${input.path}`;
          if (!cur.includes(input.oldString)) return `edit: oldString not found in ${input.path}`;
          await sandbox.writeFile(input.path, cur.replace(input.oldString, input.newString));
          return `edited ${input.path}`;
        },
      }),
    );
  }
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
 * Build the flue-backed StageRunner for a ticket run. `registerProvider` is
 * idempotent per isolate; the OAuth token is refreshed per stage.
 */
export function flueStageRunner(
  env: Env,
  sandboxId: string,
  selfOrigin: string,
  ticketId: string,
): StageRunner {
  const sandbox = sandboxDriver(env, sandboxId);
  const core = coreFor(env, selfOrigin);
  let repo = "";

  return {
    async runStage(input: StageRunInput): Promise<StageRunResult> {
      // Fresh custodian OAuth token → pi-ai OAuth path (memory #231/#232).
      const stored = await env.TICKETS.get("auth:access");
      const token = stored ? (JSON.parse(stored) as { access: string }).access : "";
      if (!token) return { failure: { kind: "model", detail: "no fresh OAuth token (custodian push stale?)" } };
      registerProvider("anthropic", { apiKey: token });

      // OpenCode free models (fallback when Anthropic rate-limits).
      // Non-catalog providers need api + baseUrl. OpenCode Zen/Go use the
      // OpenAI-compatible chat/completions wire protocol (flue docs:
      // "openai-completions" for OpenAI-compatible endpoints).
      // Single API key for both. NOTE: openai-completions appends
      // /v1/chat/completions to baseUrl, so omit the trailing /v1 here.
      if (env.OPENCODE_API_KEY) {
        registerProvider("opencode-zen", {
          api: "openai-completions",
          baseUrl: "https://opencode.ai/zen",
          apiKey: env.OPENCODE_API_KEY,
        });
        registerProvider("opencode-go", {
          api: "openai-completions",
          baseUrl: "https://opencode.ai/go",
          apiKey: env.OPENCODE_API_KEY,
        });
      }

      if (!repo) repo = (await core.getTicket(ticketId))?.repo ?? "";
      const allow = new Set(input.tools);

      // Built-ins (filtered + write-gated) + plugin tools (assembled by the
      // same allowlist gate) + submit_work. Unknown names (e.g. Magic
      // Context) are simply absent — spec-optional in cut 1.
      const ctx = toolContext(env, selfOrigin, sandbox, { id: ticketId, repo, stage: input.stageId });
      const builtins = builtinTools(sandbox, allow, input.dir, input.writeAllow);
      const pluginTools = assembleStageTools(ctx, input.tools);
      const { tool: submit, wasSubmitted } = submitWorkTool(sandbox, input.dir);

      const model = input.model ?? "claude-sonnet-4-6";
      // Fallback chain: Anthropic (OAuth, primary) → OpenCode Zen free
      // → OpenCode Go cheap. Single API key for zen+go.
      // Exactly how the fleet's model-chains work (memory #227).
      const fallbacks: Array<{ provider: string; model: string }> = [
        { provider: "anthropic", model },
        ...(env.OPENCODE_API_KEY
          ? [
              { provider: "opencode-zen", model: "mimo-v2.5-free" },
              { provider: "opencode-zen", model: "laguna-s-2.1-free" },
              { provider: "opencode-go", model: "deepseek-v4-flash" },
            ]
          : []),
      ];
      let lastError = "";
      for (const { provider, model: m } of fallbacks) {
        const agent = defineAgent(() => ({
          model: `${provider}/${m}`,
          instructions: input.persona,
          tools: [...builtins, ...pluginTools, submit],
          sandbox: { ...cloudflareSandbox(getSandbox(env.Sandbox, sandboxId) as never, { cwd: input.cwd }), tools: () => [] },
        }));

        const ctxFlue = createFlueContext({
          id: sandboxId,
          env: {},
          agentConfig: { resolveModel: () => resolveModel(`${provider}/${m}`) },
          createDefaultEnv: async () => {
            throw new Error("no default env — stage agent supplies a sandbox factory");
          },
        });

        try {
          const harness = await ctxFlue.initializeRootHarness(agent);
          const session = await harness.session();
          const res = (await session.prompt(input.prompt)) as {
            usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost?: { total?: number } };
          };
          const stats = res.usage
            ? {
                tokens: {
                  input: res.usage.input,
                  output: res.usage.output,
                  cacheRead: res.usage.cacheRead,
                  cacheWrite: res.usage.cacheWrite,
                  total: res.usage.totalTokens,
                },
                cost: res.usage.cost?.total,
              }
            : undefined;
          if (!wasSubmitted()) {
            const existing = await sandbox.readFile(`${input.dir}/control.json`);
            if (existing == null) {
              return { stats, failure: { kind: "control", detail: "stage ended without calling submit_work" } };
            }
          }
          return { stats };
        } catch (e) {
          lastError = String((e as Error)?.message ?? e);
          if (/429|rate.?limit|overloaded|quota|credit|spend/i.test(lastError)) continue;
          return { failure: { kind: "session", detail: lastError.slice(0, 400) } };
        }
      }
      return { failure: { kind: "model", detail: `all providers exhausted: ${lastError.slice(0, 200)}` } };
    },
  };
}
