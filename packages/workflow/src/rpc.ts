// RPC stage sessions: each stage runs `pi --mode rpc` with a FIFO for
// commands (stdin) and an append-only events.jsonl (stdout). SDK-grade
// control — native steer, abort, mid-session model switch, session
// stats — while every interaction stays file-shaped and burst-idempotent:
// a verb is one exec, progress is a file tail from a byte offset.
//
// Layout per stage round dir:
//   cmd.fifo      command pipe (created before launch)
//   events.jsonl  every RPC event + command response, one JSON per line
//   session.log   stderr (launch failures, crashes)
//
// The FIFO needs a HOLDER: a process keeping a write fd open so (a) pi's
// stdin doesn't EOF between verb writes and (b) verb echoes don't block.
// `exec 3<>cmd.fifo` inside a long-lived shell does it; its pid is
// tracked in stage state for cleanup.

import type { Driver } from "./driver";

/** Launch a pi RPC session for a stage. Returns pids or null on failure. */
export async function launchRpcSession(
  driver: Driver,
  opts: {
    pi: string;
    cwd: string;
    dir: string;
    flags: string[];
    /** The initial prompt (already written to <dir>/prompt.md). */
    promptPath: string;
    /** Session environment (write gate config, stage dir for submit_work). */
    env?: Record<string, string>;
  },
): Promise<{ pid: number; holderPid: number } | null> {
  const { dir } = opts;
  const envPrefix = Object.entries(opts.env ?? {})
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  // Write the prompt to a file so the launcher can feed it.
  const promptJson = JSON.stringify({
    type: "prompt",
    message: await driver.readFile(opts.promptPath) ?? "",
  });
  await driver.writeFile(`${dir}/prompt.json`, promptJson);
  // Launcher script: starts pi, writes the prompt, enters a command loop.
  // Runs in a short-lived exec (returns after pi starts) — the CF Workflow
  // step must complete within its timeout, so we can't block for the full
  // session. The launcher persists via nohup (detached from the exec's
  // process group).
  const launcherScript = `#!/bin/bash
cd ${opts.cwd}
mkfifo ${dir}/cmd.fifo 2>/dev/null || true
# Holder keeps the write end open so pi doesn't see EOF.
nohup bash -c 'exec 3<>${dir}/cmd.fifo; while :; do sleep 3600; done' > /dev/null 2>&1 &
# Start pi reading from the FIFO (detached with nohup).
${envPrefix ? envPrefix + " " : ""}nohup ${opts.pi} --mode rpc ${opts.flags.join(" ")} < ${dir}/cmd.fifo > ${dir}/events.jsonl 2> ${dir}/session.log &
PI=$!
echo $PI > ${dir}/pi.pid
# Write the initial prompt into the FIFO (pi is now reading).
cat ${dir}/prompt.json > ${dir}/cmd.fifo
touch ${dir}/cmd.in
# Command loop: watches cmd.in for new commands, forwards to FIFO.
# Runs detached — keeps forwarding commands even after this exec returns.
nohup bash -c '
while kill -0 $(cat ${dir}/pi.pid 2>/dev/null) 2>/dev/null; do
  if [ -s ${dir}/cmd.in ]; then
    cat ${dir}/cmd.in > ${dir}/cmd.fifo
    > ${dir}/cmd.in
  fi
  sleep 0.3
done
' > /dev/null 2>&1 &
echo "STARTED"
`;
  await driver.writeFile(`${dir}/launcher.sh`, launcherScript);
  // Short-lived exec: starts everything and returns immediately. The
  // nohup'd processes survive exec cleanup (detached process group).
  const launch = await driver.exec(`bash ${dir}/launcher.sh`, { timeout: 15_000 });
  if (!launch.stdout.includes("STARTED")) {
    const log = (await driver.readFile(`${dir}/session.log`)) ?? "";
    throw new Error(`launcher failed: ${launch.stderr || log.slice(-300)}`);
  }
  // Verify pi is alive.
  await driver.exec(`sleep 1`, { timeout: 5_000 });
  const pidRaw = (await driver.readFile(`${dir}/pi.pid`))?.trim();
  const pid = pidRaw ? Number(pidRaw) : 0;
  if (!pid) throw new Error("pi pid not recorded");
  const alive = await driver.exec(`kill -0 ${pid} 2>/dev/null && echo alive || echo dead`, { timeout: 5_000 });
  if (!alive.stdout.includes("alive")) {
    const log = (await driver.readFile(`${dir}/session.log`)) ?? "";
    throw new Error(`pi died immediately: ${log.slice(-300)}`);
  }
  return { pid, holderPid: 0 };
}

/** Send one RPC command (a verb) into the session via the command channel. */
export async function sendRpc(
  driver: Driver,
  dir: string,
  command: Record<string, unknown>,
): Promise<boolean> {
  const json = JSON.stringify(command);
  // Write to cmd.in — the launcher script reads from it and forwards to
  // the FIFO. This avoids writing to the FIFO directly (which could
  // deadlock if the FIFO buffer is full and pi isn't reading).
  const r = await driver.exec(
    `printf '%s\\n' '${json.replace(/'/g, "'\\''")}' >> ${dir}/cmd.in && echo SENT`,
    { timeout: 10_000 },
  );
  return r.stdout.includes("SENT");
}

/** One parsed event/response line from events.jsonl. */
export type RpcEvent = Record<string, unknown> & { type: string };

/** UTF-8 byte length without platform globals (lib-agnostic). */
function utf8Bytes(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Read events.jsonl from a byte offset; returns events + the new offset. */
export async function tailEvents(
  driver: Driver,
  dir: string,
  fromOffset: number,
): Promise<{ events: RpcEvent[]; offset: number }> {
  const r = await driver.exec(
    `[ -f ${dir}/events.jsonl ] && tail -c +${fromOffset + 1} ${dir}/events.jsonl || true`,
    { timeout: 20_000 },
  );
  const chunk = r.stdout ?? "";
  if (!chunk) return { events: [], offset: fromOffset };
  // Only complete lines (up to the last \n) advance the offset — a torn
  // final line is re-read whole next burst.
  const completeBytes = chunk.lastIndexOf("\n") + 1;
  if (completeBytes === 0) return { events: [], offset: fromOffset };
  const events: RpcEvent[] = [];
  for (const line of chunk.slice(0, completeBytes).split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as RpcEvent);
    } catch {
      /* non-JSON noise — skip */
    }
  }
  return { events, offset: fromOffset + utf8Bytes(chunk.slice(0, completeBytes)) };
}

/** Scan a burst's events for the signals the engine acts on. */
export function digestEvents(events: RpcEvent[]): {
  settled: boolean;
  modelFailure?: string;
  stats?: {
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    cost?: number;
    contextPercent?: number | null;
  };
} {
  let settled = false;
  let modelFailure: string | undefined;
  let stats: ReturnType<typeof digestEvents>["stats"];
  for (const ev of events) {
    if (ev.type === "agent_settled") settled = true;
    if (ev.type === "auto_retry_end" && ev.success === false) {
      modelFailure = String(ev.finalError ?? "model retries exhausted").slice(0, 300);
    }
    if (ev.type === "response" && ev.command === "get_session_stats" && ev.success) {
      const d = ev.data as {
        tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
        cost?: number;
        contextUsage?: { percent?: number | null };
      };
      stats = {
        tokens: d.tokens,
        cost: d.cost,
        contextPercent: d.contextUsage?.percent ?? null,
      };
    }
  }
  return { settled, modelFailure, stats };
}

/** Kill an RPC session (pi + holder) and remove the fifo. Best-effort. */
export async function killRpcSession(
  driver: Driver,
  dir: string,
  pid?: number,
  holderPid?: number,
): Promise<void> {
  const kills = [pid, holderPid].filter(Boolean).map((p) => `kill -9 ${p} 2>/dev/null;`).join(" ");
  await driver.exec(`${kills} rm -f ${dir}/cmd.fifo`, { timeout: 10_000 });
}

/** Human-readable rendering of a burst's events for live output panes. */
export function renderEvents(events: RpcEvent[]): string {
  const out: string[] = [];
  for (const ev of events) {
    if (ev.type === "message_update") continue; // deltas — too chatty for polling
    if (ev.type === "message_end") {
      const msg = ev.message as { role?: string; content?: unknown } | undefined;
      if (msg?.role === "assistant" && Array.isArray(msg.content)) {
        for (const c of msg.content as Array<{ type: string; text?: string }>) {
          if (c.type === "text" && c.text?.trim()) out.push(c.text.trim());
        }
      }
    }
    if (ev.type === "tool_execution_start") {
      out.push(`▶ ${ev.toolName}(${JSON.stringify(ev.args ?? {}).slice(0, 160)})`);
    }
    if (ev.type === "tool_execution_end") {
      out.push(`✓ ${ev.toolName}${ev.isError ? " (error)" : ""}`);
    }
    if (ev.type === "auto_retry_start") {
      out.push(`⟳ model retry ${ev.attempt}/${ev.maxAttempts}: ${String(ev.errorMessage).slice(0, 120)}`);
    }
  }
  return out.join("\n");
}
