/**
 * Stage sessions — each stage runs `pi --mode rpc` with a FIFO for
 * commands and an append-only events.jsonl. The initial prompt is sent
 * as a JSONL command. The engine polls events.jsonl for agent_settled
 * between drive bursts. Steering and promotion restart the session.
 *
 * Layout per stage round dir:
 *   cmd.fifo      command pipe (named pipe)
 *   cmd.in        command channel (regular file, tailed by command loop)
 *   prompt.json   initial prompt (written before launch)
 *   events.jsonl  every event, one JSON per line (append-only)
 *   session.log   stderr (launch failures, crashes)
 *   control.json  stage control (written by submit_work extension)
 *   analysis.md   stage analysis (written by submit_work extension)
 */

import type { Driver } from "./driver";

/** Launch a pi RPC session for a stage. Returns pid or null on failure. */
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
  // Write the prompt to a JSONL command file.
  const promptText = (await driver.readFile(opts.promptPath)) ?? "";
  const promptJson = JSON.stringify({ type: "prompt", message: promptText });
  await driver.writeFile(`${dir}/prompt.json`, promptJson);
  // Launcher: FIFO setup, pi start, prompt write (with newline for JSONL),
  // command loop. All nohup'd to survive exec returning.
  const launcher = [
    `cd ${cwd}`,
    `mkfifo ${dir}/cmd.fifo 2>/dev/null || true`,
    // Holder: write-only fd keeps FIFO open (never reads data meant for pi).
    `nohup bash -c 'exec 3>${dir}/cmd.fifo; while :; do sleep 3600; done' >/dev/null 2>&1 &`,
    // Start pi reading from FIFO.
    `${envPrefix ? envPrefix + " " : ""}nohup pi --mode rpc ${opts.flags.join(" ")} < ${dir}/cmd.fifo > ${dir}/events.jsonl 2> ${dir}/session.log &`,
    `echo $! > ${dir}/pi.pid`,
    // Write initial prompt + newline (JSONL reader needs the newline).
    `(cat ${dir}/prompt.json; echo) > ${dir}/cmd.fifo`,
    // Command loop for additional commands (steer, abort).
    `touch ${dir}/cmd.in`,
    `nohup bash -c 'while kill -0 $(cat ${dir}/pi.pid 2>/dev/null) 2>/dev/null; do if [ -s ${dir}/cmd.in ]; then (cat ${dir}/cmd.in; echo) > ${dir}/cmd.fifo; > ${dir}/cmd.in; fi; sleep 0.3; done' >/dev/null 2>&1 &`,
    `echo STARTED`,
  ].join(" && ");
  await driver.writeFile(`${dir}/launcher.sh`, launcher);
  const r = await driver.exec(`bash ${dir}/launcher.sh`, { timeout: 15_000 });
  if (!r.stdout.includes("STARTED")) {
    const log = (await driver.readFile(`${dir}/session.log`)) ?? "";
    throw new Error(`launcher failed: ${r.stderr || log.slice(-300)}`);
  }
  await driver.exec(`sleep 1`, { timeout: 5_000 });
  const pidRaw = (await driver.readFile(`${dir}/pi.pid`))?.trim();
  const pid = pidRaw ? Number(pidRaw) : 0;
  if (!pid) throw new Error("pi pid not recorded");
  const alive = await driver.exec(
    `kill -0 ${pid} 2>/dev/null && echo alive || echo dead`,
    { timeout: 5_000 },
  );
  if (!alive.stdout.includes("alive")) {
    const log = (await driver.readFile(`${dir}/session.log`)) ?? "";
    throw new Error(`pi died immediately: ${log.slice(-300)}`);
  }
  return { pid };
}

/** Check if a session process is still alive. */
export async function sessionAlive(driver: Driver, pid: number): Promise<boolean> {
  const r = await driver.exec(`kill -0 ${pid} 2>/dev/null && echo alive || echo dead`, { timeout: 5_000 });
  return r.stdout.includes("alive");
}

/** Send a command to a running session via the cmd.in channel. */
export async function sendCommand(
  driver: Driver,
  dir: string,
  command: Record<string, unknown>,
): Promise<boolean> {
  const json = JSON.stringify(command).replace(/'/g, "'\\''");
  const r = await driver.exec(
    `printf '%s\\n' '${json}' >> ${dir}/cmd.in && echo SENT`,
    { timeout: 10_000 },
  );
  return r.stdout.includes("SENT");
}

/** Kill a running session process. */
export async function killSession(driver: Driver, pid: number): Promise<void> {
  await driver.exec(
    `kill ${pid} 2>/dev/null; sleep 0.5; kill -9 ${pid} 2>/dev/null || true`,
    { timeout: 10_000 },
  );
}

// ---- Event utilities (used by the engine) ----

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
    if (e.type === "auto_retry_end" && (e as Record<string, unknown>).success === false) {
      modelFailed = true;
      error = String((e as Record<string, unknown>).finalError ?? (e as Record<string, unknown>).error ?? "");
    }
    if (e.type === "error" || e.type === "agent_error") error = String((e as Record<string, unknown>).message ?? e.error ?? "");
  }
  return { settled, stats, modelFailed, error };
}

/** Render events into a human-readable transcript for live output. */
export function renderEvents(events: SessionEvent[]): string {
  const lines: string[] = [];
  for (const e of events) {
    const rec = e as Record<string, unknown>;
    const msg = rec.message as Record<string, unknown> | undefined;
    if (e.type === "message_start" && msg?.role === "assistant") {
      lines.push(`[assistant] ${String(msg.content ?? "").slice(0, 200)}`);
    }
    if (e.type === "tool_execution_start") {
      lines.push(`[tool: ${rec.toolName ?? e.name ?? "?"}]`);
    }
    if (e.type === "turn_end") {
      const usage = rec.usage as Record<string, unknown> | undefined;
      if (usage) lines.push(`[turn: ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out]`);
    }
  }
  return lines.join("\n");
}
