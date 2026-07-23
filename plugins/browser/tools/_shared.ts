// Shared helpers for the browser stage tools (agent-browser CLI wrapper).
import type { SandboxHandle } from "@workhorse/api";

export const WRAPPER = "/usr/local/bin/agent-browser-wrapper";
export const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Exec the agent-browser wrapper with args; return stdout (throws on failure). */
export async function ab(sandbox: SandboxHandle, args: string[]): Promise<string> {
  const r = await sandbox.exec(`${WRAPPER} ${args.map(q).join(" ")}`, { timeout: 60_000 });
  if (r.exitCode !== 0) throw new Error(`agent-browser ${args[0]}: ${(r.stderr || r.stdout).slice(0, 500)}`);
  return r.stdout;
}
