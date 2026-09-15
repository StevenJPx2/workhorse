// browser_record now uses agent-browser's NATIVE record start/stop, so these
// tests are about sequencing and conversion rather than a frame loop.
//
// The one thing needing care is the wait between start and stop: it is a real
// setTimeout, so the clock is stubbed to make it instant. vitest's fake timers
// advance 1:1 with real time under shouldAdvanceTime, which would make a 30s
// cap test actually take 30s.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_record from "../browser_record";

const STOPPED = JSON.stringify({ success: true, data: { frames: 106, path: "/tmp/x.webm" } });

const okExec = {
  "mkdir -p": "",
  "rm -f": "",
  "'record' 'start'": "{}",
  "'record' 'stop'": STOPPED,
  "'eval'": "{}",
  ffmpeg: { exitCode: 0 },
  "wc -c": "65536",
};

const realSetTimeout = globalThis.setTimeout;

const record = (input: Record<string, unknown> = {}, exec = okExec) =>
  runTool(browser_record, { savePath: "/out/demo.gif", ...input }, { sandbox: { exec } });

describe("browser_record", () => {
  beforeEach(() => {
    // Virtual clock: setTimeout resolves on the next macrotask but jumps
    // Date.now() forward, so a 30s recording completes instantly.
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("setTimeout", (fn: () => void, ms = 0) => {
      now += ms;
      return realSetTimeout(fn, 0);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns documentation for help without touching the browser", async () => {
    const { output, sandbox } = await runTool(browser_record, { savePath: "/x.gif", help: true });

    expect(output).toContain("browser_record");
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("uses the NATIVE record command, not a screenshot loop", async () => {
    const { sandbox } = await record();

    expect(sandbox.ranCommandContaining("'record' 'start'")).toBe(true);
    expect(sandbox.ranCommandContaining("'record' 'stop'")).toBe(true);
    // The old implementation took one screenshot per frame — dozens of execs.
    expect(sandbox.ranCommandContaining("screenshot")).toBe(false);
  });

  it("records to an intermediate .webm, not straight to the gif path", async () => {
    const { sandbox } = await record();

    const start = sandbox.execCalls.find((c) => c.command.includes("'record' 'start'"))!.command;
    expect(start).toContain(".webm");
    expect(start).not.toContain(".gif");
  });

  it("orders start → eval → stop so the scripted action is captured", async () => {
    const { sandbox } = await record({ script: "window.scrollTo(0,800)" });

    const idx = (fragment: string) => sandbox.execCalls.findIndex((c) => c.command.includes(fragment));
    expect(idx("'record' 'start'")).toBeLessThan(idx("'eval'"));
    expect(idx("'eval'")).toBeLessThan(idx("'record' 'stop'"));
  });

  it("skips eval when no script is given", async () => {
    const { sandbox } = await record();

    expect(sandbox.ranCommandContaining("'eval'")).toBe(false);
  });

  it("converts the webm to a gif — GitHub renders GIF inline, not WebM", async () => {
    const { sandbox } = await record();

    const ff = sandbox.execCalls.find((c) => c.command.includes("ffmpeg"))!.command;
    expect(ff).toContain(".webm");
    expect(ff).toContain("/out/demo.gif");
    expect(ff).toContain("palettegen=max_colors=128");
    expect(ff).toContain("-loop 0");
  });

  it("downscales and re-times for a sane gif size", async () => {
    const { sandbox } = await record();

    const ff = sandbox.execCalls.find((c) => c.command.includes("ffmpeg"))!.command;
    expect(ff).toContain("fps=10");
    expect(ff).toContain("scale=900:-1");
  });

  it("creates the output directory before converting", async () => {
    const { sandbox } = await record();

    expect(sandbox.execCalls[0].command).toBe("mkdir -p '/out'");
  });

  it("deletes the intermediate webm — it is several times the gif's size", async () => {
    const { sandbox } = await record();

    expect(sandbox.ranCommandContaining("rm -f")).toBe(true);
  });

  it("cleans up the webm even when conversion fails", async () => {
    const { output, sandbox } = await record({}, { ...okExec, ffmpeg: { exitCode: 1, stderr: "codec missing" } });

    expect(output).toContain("GIF conversion failed");
    expect(output).toContain("codec missing");
    expect(sandbox.ranCommandContaining("rm -f")).toBe(true);
  });

  it("reports duration, frame count, path, and size", async () => {
    const { output } = await record({ durationMs: 5000 });

    expect(output).toContain("5s");
    // frames is a NUMBER in the reply; a string-only field reader drops it.
    expect(output).toContain("106 frames");
    expect(output).toContain("/out/demo.gif");
    expect(output).toContain("(64 KiB)");
    expect(output).toContain("upload_image");
  });

  it("omits the frame count when the reply lacks one", async () => {
    const { output } = await record({}, { ...okExec, "'record' 'stop'": '{"success":true,"data":{}}' });

    expect(output).toContain("/out/demo.gif");
    expect(output).not.toContain("frames");
  });

  it("caps the recording at 30s", async () => {
    // Without the virtual clock this assertion would cost 30 real seconds.
    const { output } = await record({ durationMs: 600_000 });

    expect(output).toContain("30s");
  });

  it("floors a very short duration to 500ms rather than recording nothing", async () => {
    const { output } = await record({ durationMs: 10 });

    expect(output).toContain("1s");
  });

  it("defaults to 5s", async () => {
    const { output } = await record();

    expect(output).toContain("5s");
  });

  it("reports a start failure without attempting conversion", async () => {
    const { output, sandbox } = await record(
      {},
      { ...okExec, "'record' 'start'": "error: recording already in progress" },
    );

    expect(output).toContain("failed to start");
    expect(sandbox.ranCommandContaining("ffmpeg")).toBe(false);
  });
});
