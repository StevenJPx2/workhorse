// CONTRACT TESTS — run the REAL imgup CLI, not a fake sandbox.
//
// Mocked tests prove upload_image builds the command it intended. They cannot
// prove imgup ACCEPTS that command. The browser plugin lost six bugs to exactly
// that gap (a flag that didn't exist, a subcommand that silently dropped it), so
// every CLI-exec tool gets this layer.
//
// What this checks, WITHOUT uploading anything:
//   - every host in DEFAULT_HOSTS is a value imgup actually accepts
//   - our exact flag combination parses
//   - the exit code DISTINGUISHES a bad invocation from a failed upload
//
// No network: each case points at a nonexistent file, so imgup parses the
// command line, fails to read the file, and exits — never contacting a host.
//
// Gated by IMGUP_CONTRACT=1 (`bun run test:contract:imgup`); skipped in normal CI.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

const ENABLED = process.env.IMGUP_CONTRACT === "1";

/** The chain upload_image ships with — must stay in sync with the tool. */
const DEFAULT_HOSTS = ["imgbb", "imgbox", "pixhost", "catbox"];

/** A path that cannot exist, so imgup parses then fails without network I/O. */
const ABSENT = "/tmp/workhorse-contract-absent-92f1c4.png";

/**
 * Run imgup and return its exit code plus output.
 *
 * clap's convention is the load-bearing detail: exit 2 means it REJECTED the
 * command line, exit 1 means it accepted the command line and failed at
 * runtime. Reading these through a pipe would report the pipe's status instead
 * — the mistake that made an earlier agent-browser probe look like it never
 * signalled errors.
 */
async function imgup(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec("imgup", args, { timeout: 30_000 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? String(e) };
  }
}

describe.skipIf(!ENABLED)("imgup contract", () => {
  it("accepts our exact flag combination", async () => {
    const { code, stderr } = await imgup(["-H", "imgbb", "-f", "plain", "--no-clipboard", ABSENT]);

    // 1 = flags parsed, then the missing file failed it. 2 would mean imgup
    // rejected our command line, which is the bug this test exists to catch.
    expect(code, `imgup rejected our flags: ${stderr}`).toBe(1);
    expect(stderr).not.toContain("unexpected argument");
  }, 60_000);

  it.each(DEFAULT_HOSTS)("accepts %s as a hosting value", async (host) => {
    const { code, stderr } = await imgup(["-H", host, "-f", "plain", "--no-clipboard", ABSENT]);

    // A host imgup dropped from its enum would exit 2 here — and in production
    // upload_image would silently walk past it reporting "host failed".
    expect(code, `imgup does not accept host "${host}": ${stderr}`).toBe(1);
  }, 60_000);

  it.each(["plain", "markdown", "html"])("accepts %s as an output format", async (format) => {
    // upload_image's format picklist must be a subset of imgup's.
    const { code } = await imgup(["-H", "imgbb", "-f", format, "--no-clipboard", ABSENT]);

    expect(code, `imgup does not accept format "${format}"`).toBe(1);
  }, 60_000);

  it("REJECTS an unknown flag with a distinct exit code", async () => {
    const { code, stderr } = await imgup(["--no-such-flag", ABSENT]);

    // This is the control: it proves exit 1 above actually means "flags fine",
    // rather than imgup returning 1 for everything.
    expect(code).toBe(2);
    expect(stderr).toContain("unexpected argument");
  }, 60_000);

  it("REJECTS an unknown host with a distinct exit code", async () => {
    const { code } = await imgup(["-H", "definitely-not-a-host", "-f", "plain", ABSENT]);

    expect(code).toBe(2);
  }, 60_000);

  it("distinguishes a malformed invocation from a failed upload", async () => {
    const bad = await imgup(["--bogus", ABSENT]);
    const good = await imgup(["-H", "imgbb", "-f", "plain", "--no-clipboard", ABSENT]);

    // KNOWN GAP, pinned deliberately: upload_image treats ANY nonzero exit as
    // "this host failed, try the next one". So if a future imgup renames a flag
    // or drops a host, every host would exit 2 and the tool would report
    // "every host failed" instead of "our invocation is malformed" — a silent
    // misdiagnosis. The exit codes DO carry the distinction; the tool just
    // doesn't read it yet.
    expect(bad.code).toBe(2);
    expect(good.code).toBe(1);
    expect(bad.code).not.toBe(good.code);
  }, 60_000);
});
