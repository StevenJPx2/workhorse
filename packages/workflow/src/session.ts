/**
 * SDK stage sessions — each stage runs pi-coding-agent programmatically
 * via createAgentSession + prompt. No CLI, no subprocess, no FIFO.
 *
 * The runner script (sandbox/runner.mjs) is a thin shim that imports the
 * SDK, loads extensions, and runs the agent to completion. Events stream
 * to events.jsonl (tailed by the engine between drive bursts).
 *
 * Layout per stage round dir:
 *   events.jsonl  session events (append-only, tailed by the engine)
 *   session.log   stderr (launch failures, crashes)
 *   control.json  stage control (written by submit_work extension)
 *   analysis.md   stage analysis (written by submit_work extension)
 */

import type { Driver } from "./driver";

/**
 * Launch an SDK session for a stage. The exec blocks until the agent
 * finishes. Returns immediately after starting — the caller should
 * poll events.jsonl for agent_settled.
 */
export async function launchSdkSession(
  driver: Driver,
  opts: {
    dir: string;
    cwd: string;
    promptPath: string;
    flags: string[];
    env?: Record<string, string>;
  },
): Promise<{ pid: number } | null> {
  const { dir, cwd } = opts;
  const envPrefix = Object.entries(opts.env ?? {})
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  const flagsStr = opts.flags.join(" ");
  // Run the SDK runner in the foreground. This exec blocks until the
  // agent finishes (5-20 min). The engine polls events.jsonl for
  // agent_settled in subsequent advance() calls.
  // Run the SDK runner from /opt/agent (where node_modules lives) so
  // bare-specifier imports resolve. The cwd arg tells the runner where
  // the repo is.
  const cmd = `cd /opt/agent && ${envPrefix ? envPrefix + " " : ""}node runner.mjs ${dir} ${opts.promptPath} ${flagsStr} 2> ${dir}/session.log`;
  driver.exec(cmd, { timeout: 30 * 60_000 }).catch(() => {});
  // Wait a moment for the process to start.
  await driver.exec(`sleep 2`, { timeout: 5_000 });
  // Find the node process PID.
  const ps = await driver.exec(
    `ps aux | grep "[r]unner.mjs.*${dir}" | head -1 | awk '{print $2}'`,
    { timeout: 5_000 },
  );
  const pid = Number(ps.stdout.trim()) || 0;
  return pid ? { pid } : null;
}

/**
 * Check if the SDK session is still alive (the node process is running).
 */
export async function sessionAlive(driver: Driver, pid: number): Promise<boolean> {
  const r = await driver.exec(`kill -0 ${pid} 2>/dev/null && echo alive || echo dead`, { timeout: 5_000 });
  return r.stdout.includes("alive");
}

/**
 * Send an RPC-style command to a running session. In the SDK approach,
 * commands are written to a command file that the runner reads (if
 * supported). For now, this is a no-op — the SDK runner runs to
 * completion without mid-session commands. Steering and model switching
 * happen between runs (the engine resets and re-launches).
 */
export async function sendCommand(
  driver: Driver,
  dir: string,
  command: Record<string, unknown>,
): Promise<boolean> {
  // Write the command to a file for potential future use.
  await driver.writeFile(`${dir}/command.json`, JSON.stringify(command));
  return true;
}

/**
 * Write a raw event into events.jsonl (for test helpers and the mock driver
 * to simulate SDK responses).
 */
export function writeEvent(driver: Driver, dir: string, event: Record<string, unknown>): Promise<void> {
  return driver.writeFile(
    `${dir}/events.jsonl`,
    ((driver as unknown as { files?: Map<string, string> }).files?.get(`${dir}/events.jsonl`) ?? "") +
      JSON.stringify(event) + "\n",
  );
}

/**
 * Kill a running SDK session.
 */
export async function killSession(driver: Driver, pid: number): Promise<void> {
  await driver.exec(`kill ${pid} 2>/dev/null; sleep 0.5; kill -9 ${pid} 2>/dev/null || true`, { timeout: 10_000 });
}

// ---- Event utilities (shared by the engine) ----

/** One parsed event line from events.jsonl. */
export type SessionEvent = Record<string, unknown> & { type: string };

/** Tail events from a byte offset. Returns new events + new offset. */
export async function tailEvents(
  driver: Driver,
  dir: string,
  offset: number,
): Promise<{ events: SessionEvent[]; offset: number }> {
  const raw = (await driver.readFile(`${dir}/events.jsonl`)) ?? "";
  if (raw.length <= offset) return { events: [], offset };
  const chunk = raw.slice(offset);
  const events: SessionEvent[] = [];
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return { events, offset: raw.length };
}

/** Digest events into a summary for the engine. */
export function digestEvents(events: SessionEvent[]): {
  settled: boolean;
  stats?: Record<string, unknown>;
  modelFailed: boolean;
  error?: string;
} {
  let settled = false;
  let stats: Record<string, unknown> | undefined;
  let modelFailed = false;
  let error: string | undefined;
  for (const e of events) {
    if (e.type === "agent_settled") settled = true;
    if (e.type === "session_stats") stats = e as unknown as Record<string, unknown>;
    if (e.type === "runner_error") error = String(e.error ?? "");
    if (e.type === "auto_retry_end" && e.success === false) {
      modelFailed = true;
      error = String((e as Record<string, unknown>).finalError ?? (e as Record<string, unknown>).error ?? "");
    }
    if (e.type === "error" || e.type === "agent_error") error = String(e.message ?? e.error ?? "");
  }
  return { settled, stats, modelFailed, error };
}

/** Render events into a human-readable transcript for live output. */
export function renderEvents(events: SessionEvent[]): string {
  const lines: string[] = [];
  for (const e of events) {
    const msg = (e as Record<string, unknown>).message as Record<string, unknown> | undefined;
    if (e.type === "message_start" && msg?.role === "assistant") {
      lines.push(`[assistant] ${String(msg.content ?? "").slice(0, 200)}`);
    }
    if (e.type === "tool_execution_start") {
      lines.push(`[tool: ${(e as Record<string, unknown>).toolName ?? e.name ?? "?"}]`);
    }
    if (e.type === "turn_end") {
      const usage = (e as Record<string, unknown>).usage as Record<string, unknown> | undefined;
      if (usage) lines.push(`[turn: ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out]`);
    }
  }
  return lines.join("\n");
}
