// CONTRACT TESTS — run the REAL agent-browser CLI, not a fake sandbox.
//
// Why this file exists: the mocked tests can only prove "we built the string we
// intended". They cannot prove the string is one agent-browser accepts, or that
// the response shape is what we parse. Four shipped bugs lived in exactly that
// blind spot:
//
//   1. browser_act sent `press <selector>` — the CLI takes `press <key>`
//   2. browser_act sent `scroll <selector>` — the CLI takes `scroll <direction>`
//   3. browser_open sent `open --wait <ms>` — no such flag exists
//   4. every tool read payload fields off the top level — they live under `data`
//
// So this suite drives each tool against a real browser and a local fixture
// page, and asserts on OBSERVED behavior. It is skipped unless agent-browser is
// installed, and it opts out of any configured cloud provider so it exercises
// the same local-Chrome path the sandbox image uses.
//
// Run it with:  BROWSER_CONTRACT=1 bunx vitest run plugins/browser
//
// It is off by default because it launches a browser (seconds, not
// milliseconds) and needs a binary CI may not have.

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SandboxHandle } from "@workhorse/api";
import { runTool } from "@workhorse/test-utils/tools";
import browser_act from "../browser_act";
import browser_key from "../browser_key";
import browser_open from "../browser_open";
import browser_read from "../browser_read";
import browser_screenshot from "../browser_screenshot";
import browser_scroll from "../browser_scroll";
import browser_snapshot from "../browser_snapshot";
import { WRAPPER } from "../_shared";

const exec = promisify(execFile);

const ENABLED = process.env.BROWSER_CONTRACT === "1";
const NAMESPACE = "wh-contract";

/**
 * A SandboxHandle backed by the LOCAL machine instead of a container: exec
 * runs the real agent-browser. The tools are unchanged — they just reach a
 * real CLI instead of a fake.
 *
 * The wrapper path (/usr/local/bin/agent-browser-wrapper) only exists inside
 * the image, so it is rewritten to the local binary with the same flags the
 * wrapper applies. AGENT_BROWSER_PROVIDER/KERNEL_API_KEY are stripped so a
 * developer's cloud-provider config can't make the run depend on a network
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

    // A daemon left over from another provider keeps serving that provider, so
    // start from a clean session (this is exactly how a stale Kernel daemon
    // produced 401s on every local command).
    await sandbox.exec(`${WRAPPER} close --all`);
  }, 120_000);

  afterAll(async () => {
    await sandbox.exec(`${WRAPPER} close --all`);
  });

  const opts = () => ({ sandbox });

  it("browser_open navigates and reports the landed URL", async () => {
    const { output } = await runTool(browser_open, { url: pageUrl }, opts());

    expect(output).toContain("Browser open:");
    // Proves the envelope is unwrapped — a top-level read yields the raw JSON.
    expect(output).toContain("fixture.html");
    expect(output).not.toContain("success");
  }, 120_000);

  it("browser_open accepts a batched settle wait", async () => {
    const { output } = await runTool(browser_open, { url: pageUrl, waitMs: 300 }, opts());
    expect(output).toContain("fixture.html");
  }, 60_000);

  it("browser_open accepts a load-state wait", async () => {
    const { output } = await runTool(browser_open, { url: pageUrl, waitFor: "domcontentloaded" }, opts());
    expect(output).toContain("fixture.html");
  }, 60_000);

  it("browser_snapshot returns a readable AX tree with refs", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_snapshot, {}, opts());

    expect(output).toMatch(/ref=e\d+/);
    expect(output).toContain("button");
    // The tree, not the envelope.
    expect(output).not.toContain('"success"');
  }, 60_000);

  it("browser_snapshot honors a custom depth", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_snapshot, { depth: 1 }, opts());
    expect(output).toBeTruthy();
  }, 60_000);

  it("browser_snapshot scopes to a selector", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_snapshot, { selector: "#dropdown", interactiveOnly: false }, opts());
    expect(output).toBeTruthy();
  }, 60_000);

  it("browser_read returns page TEXT, not a JSON envelope", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_read, {}, opts());

    // This is bug #4's regression guard: data.content, not top-level content.
    expect(output).toContain("quick brown fox");
    expect(output).not.toContain('"contentType"');
  }, 60_000);

  it("browser_act clicks a real element by ref", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const snap = await runTool(browser_snapshot, {}, opts());
    const ref = snap.output.match(/button "Click me" \[ref=(e\d+)\]/)?.[1];
    expect(ref, "snapshot should expose the button ref").toBeTruthy();

    const { output } = await runTool(browser_act, { action: "click", selector: `@${ref}` }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("browser_act fills a real input", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_act, { action: "fill", selector: "#text", value: "hello" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("browser_act selects a dropdown option", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_act, { action: "select", selector: "#dropdown", value: "b" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("browser_act checks a checkbox with no value argument", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const { output } = await runTool(browser_act, { action: "check", selector: "#box" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("browser_key presses a real key — the CLI accepts a KEY, not a selector", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    await runTool(browser_act, { action: "click", selector: "#text" }, opts());

    // Bug #1's regression guard: this used to send an element ref as the key.
    const { output } = await runTool(browser_key, { key: "Tab" }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("browser_scroll scrolls the page — the CLI accepts a DIRECTION, not a selector", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());

    // Bug #2's regression guard: this used to send a ref as the direction.
    const { output } = await runTool(browser_scroll, { direction: "down", amount: 500 }, opts());
    expect(output).not.toContain("error");
  }, 60_000);

  it("browser_screenshot writes a real file and reports a nonzero size", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const path = join(dir, "shot.png");
    const { output } = await runTool(browser_screenshot, { savePath: path }, opts());

    expect(output).toContain(path);
    // A 0 KiB report means the capture silently failed.
    expect(output).not.toContain("(0 KiB)");
  }, 60_000);

  it("browser_screenshot captures a full page", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    const path = join(dir, "full.png");
    const { output } = await runTool(browser_screenshot, { savePath: path, fullPage: true }, opts());
    expect(output).not.toContain("(0 KiB)");
  }, 60_000);

  it("a failed command surfaces as a throw, not a silent success", async () => {
    await runTool(browser_open, { url: pageUrl }, opts());
    await expect(runTool(browser_act, { action: "click", selector: "@e9999" }, opts())).rejects.toThrow();
  }, 60_000);
});
