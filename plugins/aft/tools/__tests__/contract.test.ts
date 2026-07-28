// CONTRACT TESTS — drive the REAL aft binary.
//
// These exist because the mocked aft tests only prove we build the argv string
// we intended. They do not prove `aft` accepts it. It does not:
//
//   AFT IS A JSON-RPC-OVER-STDIN SERVER, NOT AN ARGV CLI.
//
// Our tools shell out as `aft outline --json <file>`. The real binary ignores
// those argv words entirely, reads a JSON request from stdin, sees stdin closed
// immediately, and exits 0 with EMPTY stdout. Because the helper treats exit 0
// as success, every aft_* tool returns the string "(no output)" — a silent
// no-op that looks like a working tool returning nothing interesting.
//
// The real protocol (verified against aft 0.42.0):
//   stdin:  {"id":"1","command":"outline","file":"<path>"}
//   stdout: {"id":"1","success":true,"text":"..."}
//   ids must be STRINGS; commands are outline|zoom|inspect|configure (NOT
//   search or edit); inspect requires a prior `configure` call.
//
// These tests PIN the real protocol so the fix is verifiable, and document the
// current breakage rather than asserting it is correct.
//
// Gated by AFT_CONTRACT=1 (`bun run test:contract:aft`) and self-skips when no
// cached binary is present.

import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

/** Newest binary in AFT's own cache — the same one the harness plugin uses. */
function findAftBinary(): string | null {
  const cache = join(homedir(), ".cache", "aft", "bin");
  if (!existsSync(cache)) return null;

  const versions = readdirSync(cache)
    .filter((d) => d.startsWith("v"))
    .sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );

  for (const v of versions) {
    const candidate = join(cache, v, "aft");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const AFT = findAftBinary();
const ENABLED = process.env.AFT_CONTRACT === "1" && AFT !== null;

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const SAMPLE = "packages/api/src/plugin.ts";

/** Send one JSON-RPC request on stdin and return the parsed reply. */
async function rpc(request: Record<string, unknown>): Promise<Record<string, unknown>> {
  const child = exec(AFT!, [], { cwd: REPO, timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });
  child.child.stdin?.end(`${JSON.stringify(request)}\n`);

  const { stdout } = await child;
  const line = stdout.split("\n").find((l) => l.trim().startsWith("{"));
  return line ? (JSON.parse(line) as Record<string, unknown>) : {};
}

/** Run aft the way our tools currently do — argv words, no stdin. */
async function argv(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const child = exec(AFT!, args, { cwd: REPO, timeout: 60_000 });
    child.child.stdin?.end();
    const { stdout, stderr } = await child;
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? String(e) };
  }
}

describe.skipIf(!ENABLED)("aft contract", () => {
  it("the binary exists and reports a version via argv", async () => {
    const { stdout } = await argv(["--version"]);

    // --version is the ONE argv path that works, which is what made the argv
    // assumption look plausible.
    expect(stdout).toMatch(/aft \d+\.\d+\.\d+/);
  }, 60_000);

  // ---- the protocol our tools actually need ----

  it("outline works over JSON-RPC stdin", async () => {
    const reply = await rpc({ id: "1", command: "outline", file: SAMPLE });

    expect(reply.success).toBe(true);
    expect(String(reply.text)).toContain("plugin.ts");
    // Real structural output: symbols with line ranges.
    expect(String(reply.text)).toMatch(/\d+:\d+/);
  }, 60_000);

  it("rejects a NUMERIC id — ids must be strings", async () => {
    const child = exec(AFT!, [], { cwd: REPO, timeout: 30_000 });
    child.child.stdin?.end('{"id":1,"command":"outline","file":"x"}\n');
    const { stdout } = await child;

    // A JSON-RPC implementation written the obvious way would send id:1 and get
    // a parse error with no explanation of why.
    expect(stdout).toContain("parse_error");
    expect(stdout).toContain("expected a string");
  }, 60_000);

  it("accepts 'method' as an ALIAS for 'command'", async () => {
    // serde aliases the field, so a JSON-RPC-shaped request works — but passing
    // BOTH is a hard parse error ("duplicate field `command`"), so a client must
    // pick one.
    const reply = await rpc({ id: "1", method: "outline", file: SAMPLE });

    expect(reply.success).toBe(true);
    expect(String(reply.text)).toContain("plugin.ts");
  }, 60_000);

  it("requires the command field under one of its two names", async () => {
    const child = exec(AFT!, [], { cwd: REPO, timeout: 30_000 });
    child.child.stdin?.end('{"id":"1","tool":"aft_outline","input":{}}\n');

    // `tool`/`input` (the shape a plugin author would guess) is rejected
    // outright — params are TOP-LEVEL, not nested.
    expect((await child).stdout).toContain("missing field `command`");
  }, 60_000);

  it("names its required params when they are missing", async () => {
    const outline = await rpc({ id: "1", command: "outline" });
    expect(String(outline.message)).toContain("'file', 'files', or 'directory'");

    const zoom = await rpc({ id: "1", command: "zoom" });
    expect(String(zoom.message)).toContain("missing required param 'file'");
  }, 60_000);

  it("has no 'search' or 'edit' command — search is 'grep', and edit does not exist", async () => {
    for (const command of ["search", "edit"]) {
      const reply = await rpc({ id: "1", command });
      expect(reply.code, command).toBe("unknown_command");
    }
  }, 60_000);

  it("'grep' is the search backend — and it is REGEX, not AST", async () => {
    const regex = await rpc({ id: "1", command: "grep", pattern: "defineTool|defineAgent" });
    expect(regex.success).toBe(true);
    expect(Number(regex.total_matches)).toBeGreaterThan(0);

    // ast-grep meta-variables match literally and find nothing. aft_search
    // previously documented them as supported.
    const ast = await rpc({ id: "1", command: "grep", pattern: "defineTool($$$)" });
    expect(ast.total_matches).toBe(0);
  }, 60_000);

  it("SILENTLY IGNORES unknown params — a made-up filter looks like it works", async () => {
    const bogus = await rpc({ id: "1", command: "grep", pattern: "tool", totally_bogus_param: "x" });

    // ACCEPTED, not rejected — that is the hazard. This is why aft_search must
    // not offer a `lang` filter: it would appear scoped while searching
    // everything. (files_searched is not compared: it varies run to run as the
    // index warms, so equality would be flaky.)
    expect(bogus.success).toBe(true);
    expect(bogus.code).toBeUndefined();
  }, 60_000);

  it("only 'path' actually narrows a grep", async () => {
    const all = await rpc({ id: "1", command: "grep", pattern: "tool" });
    const scoped = await rpc({ id: "1", command: "grep", pattern: "tool", path: "packages" });

    expect(Number(scoped.files_searched)).toBeLessThan(Number(all.files_searched));
  }, 60_000);

  it("file and directory params are NOT interchangeable", async () => {
    const dirAsFile = await rpc({ id: "1", command: "outline", file: "packages/api/src" });
    expect(dirAsFile.success).toBe(false);
    expect(String(dirAsFile.message)).toContain("Is a directory");

    const fileAsDir = await rpc({ id: "1", command: "outline", directory: "packages/api/src/plugin.ts" });
    expect(fileAsDir.success).toBe(false);
  }, 60_000);

  it("inspect works once configure precedes it in the SAME stream", async () => {
    const child = exec(AFT!, [], { cwd: REPO, timeout: 180_000, maxBuffer: 20 * 1024 * 1024 });
    child.child.stdin?.end(
      `${JSON.stringify({ id: "1", command: "configure", harness: "runner", project_root: REPO })}\n` +
        `${JSON.stringify({ id: "2", command: "inspect" })}\n`,
    );

    const { stdout } = await child;
    const lines = stdout
      .split("\n")
      .filter((l) => l.trim().startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);

    // AFT interleaves UNSOLICITED notification lines between replies — this
    // stream carries a {"type":"configure_warnings"} line with no id. Replies
    // must therefore be matched BY ID, which is what aftSequence does;
    // positional pairing would hand request 2 the notification.
    const notification = lines.find((l) => l.type === "configure_warnings");
    expect(notification, "aft emits configure_warnings between replies").toBeDefined();
    expect(notification?.id).toBeUndefined();

    // configure only applies to the process it ran in, so a separate exec
    // would lose it — the reason aftSequence exists.
    expect(lines.find((l) => l.id === "1")?.success).toBe(true);
    const inspected = lines.find((l) => l.id === "2");
    expect(inspected?.success).toBe(true);
    expect(inspected?.summary).toBeDefined();
  }, 240_000);

  it("requires 'configure' before inspect", async () => {
    const reply = await rpc({ id: "1", command: "inspect" });

    expect(reply.code).toBe("not_configured");
    expect(String(reply.message)).toContain("configure must run before");
  }, 60_000);

  // ---- the currently-shipping invocation, pinned as broken ----

  it("SILENTLY NO-OPS on the argv form our tools use", async () => {
    const { code, stdout } = await argv(["outline", "--json", SAMPLE]);

    // THE BUG. Exit 0 with empty stdout means our aft() helper reports success
    // and the tool returns "(no output)". Nothing errors; every aft_* tool is
    // simply inert. That is strictly worse than a crash, which would have been
    // noticed the first time a stage used it.
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("");
  }, 60_000);

  it("confirms the failure mode is invisible: exit 0 for a nonsense command too", async () => {
    const { code } = await argv(["this-is-not-a-command", "--nor-is-this"]);

    // No argv is ever wrong, because argv is never read. There is no
    // combination of flags our current helper could pass that would fail
    // loudly — which is exactly why this went unnoticed.
    expect(code).toBe(0);
  }, 60_000);
});
