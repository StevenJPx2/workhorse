// AFT transport: JSON-RPC over stdin, NOT an argv CLI.
//
// `aft` reads newline-delimited JSON requests from stdin and writes one JSON
// reply per line to stdout. It IGNORES argv entirely (except --version). The
// previous version of this file shelled out as `aft outline --json <file>`,
// which meant the binary read a closed stdin, exited 0, and printed nothing —
// so the helper's exitCode check passed and every aft_* tool returned
// "(no output)". A silent no-op, which is why it went unnoticed.
//
// Protocol (verified against aft 0.42.0 and 0.49.0):
//   stdin   {"id":"1","command":"outline","file":"src/app.ts"}
//   stdout  {"id":"1","success":true,"text":"..."}
//   error   {"id":"1","success":false,"code":"file_not_found","message":"..."}
//
// Constraints that are easy to get wrong:
//   - `id` MUST be a string; a numeric id is a hard parse error
//   - params are TOP-LEVEL, not nested under `input`/`params`
//   - `method` is a serde alias for `command`, but sending BOTH is a
//     duplicate-field parse error, so we only ever send `command`
//   - `file` and `directory` are NOT interchangeable: passing a directory as
//     `file` fails with "Is a directory"
//
// Commands that exist: configure, outline, zoom, grep, read, write, inspect,
// checkpoint, undo, status. There is NO `search` (grep covers it) and NO
// symbol-level `edit` (write is whole-file only).

import type { SandboxHandle } from "@workhorse/api";

/** Where the harness installer puts the binary. Not on PATH — `aft` alone is exit 127. */
const AFT_BIN = "$(ls -d $HOME/.cache/aft/bin/v*/aft 2>/dev/null | sort -V | tail -1)";

/** Shell-quote for a single-quoted context. */
const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** One AFT reply. Payload keys vary by command (`text`, `content`, `summary`, …). */
export interface AftReply {
  id?: string;
  success?: boolean;
  code?: string;
  message?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Send one request and return the parsed reply.
 *
 * `id` is fixed rather than a counter: each exec is a fresh process handling a
 * single request, so correlation is trivially satisfied and a counter would
 * only add nondeterminism to test assertions.
 */
export async function aftRequest(
  sandbox: SandboxHandle,
  command: string,
  params: Record<string, unknown> = {},
): Promise<AftReply | { error: string }> {
  const request = JSON.stringify({ id: "1", command, ...params });

  // printf '%s\n' rather than echo: echo mangles backslashes in some shells,
  // and AFT payloads carry file contents and regex patterns.
  const r = await sandbox.exec(`printf '%s\\n' ${q(request)} | ${AFT_BIN}`, { timeout: 120_000 });

  if (r.exitCode === 127 || /command not found|No such file/i.test(r.stderr)) {
    return { error: "aft binary not found — the sandbox image must install it (npx @cortexkit/aft doctor --fix)" };
  }

  // Diagnostics go to stderr ("[aft] started, pid ..."), replies to stdout.
  const line = r.stdout.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) {
    const detail = r.stderr.trim().slice(-500) || r.stdout.trim().slice(-500) || "(no output)";
    return { error: `aft produced no reply (exit ${r.exitCode}): ${detail}` };
  }

  try {
    return JSON.parse(line) as AftReply;
  } catch {
    return { error: `aft reply was not JSON: ${line.slice(0, 300)}` };
  }
}

/**
 * Send a request and render it as tool output.
 *
 * A protocol-level failure (`success: false`) is returned as a readable string
 * rather than thrown: a missing file or a bad symbol is information the agent
 * should act on, not a stage-ending error.
 */
export async function aft(
  sandbox: SandboxHandle,
  command: string,
  params: Record<string, unknown> = {},
  render: (reply: AftReply) => string = defaultRender,
): Promise<string> {
  const reply = await aftRequest(sandbox, command, params);
  if ("error" in reply) return `aft error: ${reply.error}`;
  if (reply.success === false) return `aft ${command} failed (${reply.code ?? "unknown"}): ${reply.message ?? ""}`;
  return render(reply);
}

/**
 * Send several requests down ONE stdin stream, in order.
 *
 * Needed because `inspect` refuses to run until `configure` has established the
 * project root in the SAME process — and each exec is a fresh process, so they
 * cannot be separate calls.
 */
export async function aftSequence(
  sandbox: SandboxHandle,
  requests: Array<{ command: string; params?: Record<string, unknown> }>,
): Promise<AftReply[] | { error: string }> {
  const lines = requests
    .map((r, i) => JSON.stringify({ id: String(i + 1), command: r.command, ...r.params }))
    .join("\n");

  const r = await sandbox.exec(`printf '%s\\n' ${q(lines)} | ${AFT_BIN}`, { timeout: 180_000 });

  if (r.exitCode === 127 || /command not found|No such file/i.test(r.stderr)) {
    return { error: "aft binary not found — the sandbox image must install it (npx @cortexkit/aft doctor --fix)" };
  }

  const parsed: AftReply[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      parsed.push(JSON.parse(line) as AftReply);
    } catch {
      parsed.push({ success: false, code: "parse_error", message: line.slice(0, 200) });
    }
  }

  if (!parsed.length) {
    const detail = r.stderr.trim().slice(-500) || "(no output)";
    return { error: `aft produced no replies (exit ${r.exitCode}): ${detail}` };
  }

  // AFT interleaves UNSOLICITED notifications (e.g. {"type":"configure_warnings"})
  // between replies, so replies must be matched by id — positional pairing
  // would hand request 2's caller a notification instead of its answer.
  return requests.map(
    (_req, i) =>
      parsed.find((p) => p.id === String(i + 1)) ?? {
        success: false,
        code: "no_reply",
        message: `no reply for request ${i + 1}`,
      },
  );
}

/** Most commands answer in `text`; fall back to the whole reply for the rest. */
function defaultRender(reply: AftReply): string {
  if (typeof reply.text === "string") return reply.text || "(no output)";

  // Drop the envelope so the agent reads the payload, not the transport.
  const { id: _id, success: _success, ...payload } = reply;
  const keys = Object.keys(payload);
  return keys.length ? JSON.stringify(payload, null, 1).slice(0, 30_000) : "(no output)";
}
