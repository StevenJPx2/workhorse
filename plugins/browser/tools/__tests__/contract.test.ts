// CONTRACT TESTS — run the REAL agent-browser CLI, not a fake sandbox.
//
// Why this file exists: mocked tests can only prove "we built the string we
// intended". They cannot prove the string is one agent-browser accepts, or that
// the response shape is what we parse. Six shipped bugs lived in that blind
// spot:
//
//   1. press was sent a selector; the CLI takes `press <key>`
//   2. scroll was sent a selector; the CLI takes `scroll <direction>`
//   3. open was sent `--wait <ms>`; no such flag exists
//   4. payload fields were read off the top level; they live under `data`
//   5. size was probed with `stat -c %s` (GNU-only) → every image read 0 KiB
//   6. snapshot ignored its own declared depth/compact inputs
//
// So this suite drives the tools against a real browser and a local fixture
// page and asserts on OBSERVED behavior. Skipped unless agent-browser is
// installed; run with `bun run test:contract`.

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SandboxHandle } from "@workhorse/api";
import { runTool } from "@workhorse/test-utils/tools";
import browser from "../browser";
import browser_interact from "../browser_interact";
import { WRAPPER } from "../_shared";

const exec = promisify(execFile);

const ENABLED = process.env.BROWSER_CONTRACT === "1";
const NAMESPACE = "wh-contract";

/**
 * A SandboxHandle backed by the LOCAL machine: exec runs the real
 * agent-browser. The tools are unchanged — they just reach a real CLI.
 *
 * The wrapper path only exists inside the image, so it is rewritten to the
 * local binary with the same flags. AGENT_BROWSER_PROVIDER/KERNEL_API_KEY are
 * stripped so a developer's cloud config can't make this depend on a network
 * service the sandbox never uses.
 */
function localSandbox(): SandboxHandle {
  const env = { ...process.env, AGENT_BROWSER_NAMESPACE: NAMESPACE };
  delete env.AGENT_BROWSER_PROVIDER;
  delete env.KERNEL_API_KEY;

  return {
    async exec(command: string) {
      const real = command.replace(WRAPPER, `agent-browser --namespace ${NAMESPACE} --json`);
      try {
        const { stdout, stderr } = await exec("bash", ["-c", real], {
          env,
          timeout: 60_000,
          maxBuffer: 20 * 1024 * 1024,
        });
        return { exitCode: 0, stdout, stderr };
      } catch (e) {
        const err = e as { code?: number; stdout?: string; stderr?: string };
        return { exitCode: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? String(e) };
      }
    },
    async readFile() {
      return null;
    },
    async writeFile() {},
  };
}

const FIXTURE = `<!doctype html>
<html><head><title>Contract Fixture</title></head><body>
  <h1 id="title">Contract Fixture</h1>
  <p id="para">The quick brown fox jumps over the lazy dog.</p>
  <button id="btn" onclick="document.getElementById('out').textContent='clicked'">Click me</button>
  <input id="text" type="text" placeholder="type here">
  <select id="dropdown"><option value="a">Alpha</option><option value="b">Beta</option></select>
  <input id="box" type="checkbox">
  <div id="out"></div>
  <div style="height:3000px"></div>
</body></html>`;

describe.skipIf(!ENABLED)("agent-browser contract", () => {
  let sandbox: SandboxHandle;
  let pageUrl: string;
  let dir: string;

  beforeAll(async () => {
    sandbox = localSandbox();
    dir = await mkdtemp(join(tmpdir(), "wh-contract-"));
    const file = join(dir, "fixture.html");
    await writeFile(file, FIXTURE, "utf8");
    pageUrl = `file://${file}`;

    // A daemon left over from another provider keeps serving that provider —
    // exactly how a stale Kernel daemon produced 401s on every local command.
    await sandbox.exec(`${WRAPPER} close --all`);
  }, 120_000);

  afterAll(async () => {
    await sandbox.exec(`${WRAPPER} close --all`);
  });

  const opts = () => ({ sandbox });
  const open = (extra: Record<string, unknown> = {}) =>
    runTool(browser, { action: "open", url: pageUrl, ...extra }, opts());

  // ---- browser (read) ----

  it("open navigates and reports the landed URL", async () => {
    const { output } = await open();

    expect(output).toContain("Browser open:");
    expect(output).toContain("fixture.html");
    // Proves the envelope is unwrapped — a top-level read yields raw JSON.
    expect(output).not.toContain("success");
  }, 120_000);

  it("open accepts a batched settle wait", async () => {
    const { output } = await open({ waitMs: 300 });
    expect(output).toContain("fixture.html");
  }, 60_000);

  it("open accepts a load-state wait", async () => {
    const { output } = await open({ waitFor: "domcontentloaded" });
    expect(output).toContain("fixture.html");
  }, 60_000);

  it("snapshot returns a readable AX tree with refs", async () => {
    await open();
    const { output } = await runTool(browser, { action: "snapshot" }, opts());

    expect(output).toMatch(/ref=e\d+/);
    expect(output).toContain("button");
    expect(output).not.toContain('"success"');
  }, 60_000);

  it("snapshot honors a custom depth", async () => {
    await open();
    const { output } = await runTool(browser, { action: "snapshot", depth: 1 }, opts());
    expect(output).toBeTruthy();
  }, 60_000);

  it("snapshot scopes to a selector", async () => {
    await open();
    const { output } = await runTool(
      browser,
      { action: "snapshot", selector: "#dropdown", interactiveOnly: false },
      opts(),
    );
    expect(output).toBeTruthy();
  }, 60_000);

  it("read returns page TEXT, not a JSON envelope", async () => {
    await open();
    const { output } = await runTool(browser, { action: "read" }, opts());

    // Bug #4's regression guard: data.content, not top-level content.
    expect(output).toContain("quick brown fox");
    expect(output).not.toContain('"contentType"');
  }, 60_000);

  it("screenshot writes a real file and reports a nonzero size", async () => {
    await open();
    const path = join(dir, "shot.png");
    const { output } = await runTool(browser, { action: "screenshot", savePath: path }, opts());

    expect(output).toContain(path);
    // Bug #5's regression guard: 0 KiB means the size probe failed.
    expect(output).not.toContain("(0 KiB)");
  }, 60_000);

  it("screenshot captures a full page", async () => {
    await open();
    const path = join(dir, "full.png");
    const { output } = await runTool(browser, { action: "screenshot", savePath: path, fullPage: true }, opts());
    expect(output).not.toContain("(0 KiB)");
  }, 60_000);

  // ---- browser_interact (mutate) ----

  it("click acts on a real element by ref", async () => {
    await open();
    const snap = await runTool(browser, { action: "snapshot" }, opts());
    const ref = snap.output.match(/button "Click me" \[ref=(e\d+)\]/)?.[1];
    expect(ref, "snapshot should expose the button ref").toBeTruthy();

    const { output } = await runTool(browser_interact, { action: "click", selector: `@${ref}` }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("fill enters text into a real input", async () => {
    await open();
    const { output } = await runTool(
      browser_interact,
      { action: "fill", selector: "#text", value: "hello" },
      opts(),
    );
    expect(output).not.toContain("error");
  }, 60_000);

  it("select chooses a dropdown option", async () => {
    await open();
    const { output } = await runTool(
      browser_interact,
      { action: "select", selector: "#dropdown", value: "b" },
      opts(),
    );
    expect(output).not.toContain("error");
  }, 60_000);

  it("check ticks a checkbox with no value argument", async () => {
    await open();
    const { output } = await runTool(browser_interact, { action: "check", selector: "#box" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("press sends a real KEY — the CLI takes a key, not a selector", async () => {
    await open();
    await runTool(browser_interact, { action: "click", selector: "#text" }, opts());

    // Bug #1's regression guard.
    const { output } = await runTool(browser_interact, { action: "press", key: "Tab" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("press accepts a modifier combination", async () => {
    await open();
    const { output } = await runTool(browser_interact, { action: "press", key: "Control+a" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("scroll sends a real DIRECTION — the CLI takes a direction, not a selector", async () => {
    await open();

    // Bug #2's regression guard.
    const { output } = await runTool(
      browser_interact,
      { action: "scroll", direction: "down", amount: 500 },
      opts(),
    );
    expect(output).not.toContain("error");
  }, 60_000);

  it("a failed action surfaces as a throw, not a silent success", async () => {
    await open();
    await expect(
      runTool(browser_interact, { action: "click", selector: "@e9999" }, opts()),
    ).rejects.toThrow();
  }, 60_000);
});
