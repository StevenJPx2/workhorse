// Shared helpers for the browser stage tools (agent-browser CLI wrapper).
import type { SandboxHandle } from "@workhorse/api";

/**
 * The wrapper the container tools exec. Exported for the contract suite, which
 * rewrites it to the local binary to drive a real browser.
 */
export const WRAPPER = "/usr/local/bin/agent-browser-wrapper";
export const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Exec the agent-browser wrapper with args; return stdout (throws on failure). */
export async function ab(sandbox: SandboxHandle, args: string[]): Promise<string> {
  const r = await sandbox.exec(`${WRAPPER} ${args.map(q).join(" ")}`, { timeout: 60_000 });
  if (r.exitCode !== 0) throw new Error(`agent-browser ${args[0]}: ${(r.stderr || r.stdout).slice(0, 500)}`);
  return r.stdout;
}

/**
 * agent-browser --json wraps EVERY response in `{success, data, error}`, and
 * the payload fields live under `data` — `data.content` for read,
 * `data.snapshot` for snapshot, `data.path` for screenshot, `data.url` for
 * open. Reading a field off the top level silently misses it and hands the
 * agent the raw envelope instead.
 *
 * `batch --json` returns an ARRAY of `{command, result, error, success}`
 * instead, so unwrap() also accepts that and takes the first entry's result.
 */
function unwrap(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // batch: [{ command, result, error, success }, ...]
  if (Array.isArray(parsed)) {
    const first = parsed[0] as { result?: unknown } | undefined;
    const result = first?.result;
    return result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as { data?: unknown };

  // Standard envelope — payload under data.
  if (env.data && typeof env.data === "object") return env.data as Record<string, unknown>;

  // Tolerate a flat object (older versions / non-enveloped responses).
  return parsed as Record<string, unknown>;
}

/**
 * Size of a file in KiB, or 0 when it doesn't exist.
 *
 * Uses `wc -c` rather than `stat`: stat's size flag differs by flavor
 * (GNU `-c %s` vs BSD `-f %z`), so `stat -c` silently returns nothing on a
 * non-GNU host and every screenshot reports 0 KiB. `wc -c` is POSIX.
 */
export async function fileKiB(sandbox: SandboxHandle, path: string): Promise<number> {
  const r = await sandbox.exec(`wc -c < ${q(path)} 2>/dev/null || echo 0`, { timeout: 10_000 });
  return Math.round(Number(r.stdout.trim() || "0") / 1024);
}

/** Read one string field out of an agent-browser response. */
export function field(raw: string, ...names: string[]): string | undefined {
  const data = unwrap(raw);
  if (!data) return undefined;
  for (const name of names) {
    const v = data[name];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

/**
 * Read one numeric field (e.g. `record stop` reports `data.frames`).
 *
 * Separate from field() because that one filters to strings — a number would
 * come back undefined there, which is how a frame count silently disappears.
 */
export function numField(raw: string, ...names: string[]): number | undefined {
  const data = unwrap(raw);
  if (!data) return undefined;
  for (const name of names) {
    const v = data[name];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}
