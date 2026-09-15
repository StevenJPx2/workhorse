// Shared exec helper for the AFT stage tools.
import type { SandboxHandle } from "@workhorse/api";

/** Run the aft CLI in the workspace; shell-quote args, return stdout (or stderr on failure). */
export async function aft(sandbox: SandboxHandle, args: string[]): Promise<string> {
  const quoted = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  const r = await sandbox.exec(`aft ${quoted}`, { timeout: 60_000 });
  if (r.exitCode !== 0) return `aft error (exit ${r.exitCode}): ${r.stderr.slice(-2000) || r.stdout.slice(-2000)}`;
  return r.stdout || "(no output)";
}
