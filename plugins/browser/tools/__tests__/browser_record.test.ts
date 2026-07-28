// The record action drives a wall-clock frame loop (`while Date.now() - started
// < durationMs`), so a faithful test would take as long as the recording.
// Instead we install a VIRTUAL clock: setTimeout resolves on the next macrotask
// but jumps Date.now() forward by the requested delay, so the loop advances
// through simulated time instantly.
//
// vitest's fake timers can't do this — shouldAdvanceTime moves the mock clock
// 1:1 with real time, so a 12s recording still costs 12s.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser from "../browser";

const okExec = {
  "mkdir -p": "",
  "rm -rf": "",
  screenshot: "{}",
  eval: "{}",
  ffmpeg: { exitCode: 0, stdout: "", stderr: "" },
  "wc -c": "10240",
};

const realSetTimeout = globalThis.setTimeout;

const record = (input: Record<string, unknown>, exec = okExec) =>
  runTool(browser, { action: "record", savePath: "/out/a.gif", ...input }, { sandbox: { exec } });

describe("browser — record", () => {
  beforeEach(() => {
    let virtualNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => virtualNow);
    vi.stubGlobal("setTimeout", (fn: () => void, ms = 0) => {
      virtualNow += ms; // the delay "happens" instantly
      return realSetTimeout(fn, 0);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("assembles frames into a GIF at the requested path", async () => {
    const { output, sandbox } = await record({ durationMs: 1000, fps: 2 });

    expect(sandbox.ranCommandContaining("ffmpeg")).toBe(true);
    expect(output).toContain("/out/a.gif");
  });

  it("captures frames as sequentially numbered jpgs", async () => {
    const { sandbox } = await record({ durationMs: 1000, fps: 2 });

    const shots = sandbox.execCalls.filter((c) => c.command.includes("screenshot"));
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(shots[0].command).toContain("f000.jpg");
    expect(shots[1].command).toContain("f001.jpg");
  });

  it("runs the setup script before capturing", async () => {
    const { sandbox } = await record({ durationMs: 1000, fps: 2, script: "window.scrollTo(0,500)" });

    const evalIdx = sandbox.execCalls.findIndex((c) => c.command.includes("'eval'"));
    const shotIdx = sandbox.execCalls.findIndex((c) => c.command.includes("screenshot"));
    expect(evalIdx).toBeGreaterThanOrEqual(0);
    expect(evalIdx).toBeLessThan(shotIdx);
  });

  it("skips the eval step when no script is given", async () => {
    const { sandbox } = await record({ durationMs: 1000, fps: 2 });
    expect(sandbox.ranCommandContaining("'eval'")).toBe(false);
  });

  it("clamps fps to 1..4 and defaults to 2", async () => {
    const high = await record({ durationMs: 1000, fps: 60 });
    expect(high.sandbox.execCalls.find((c) => c.command.includes("ffmpeg"))?.command).toContain("-framerate 4");

    const low = await record({ durationMs: 3000, fps: 0 });
    expect(low.sandbox.execCalls.find((c) => c.command.includes("ffmpeg"))?.command).toContain("-framerate 1");

    const dflt = await record({ durationMs: 1000 });
    expect(dflt.sandbox.execCalls.find((c) => c.command.includes("ffmpeg"))?.command).toContain("-framerate 2");
  });

  it("caps duration at 12s worth of frames", async () => {
    const { sandbox } = await record({ durationMs: 600_000, fps: 4 });

    // 12s at 4fps = 48 frames max, never the 2400 the input implies.
    const shots = sandbox.execCalls.filter((c) => c.command.includes("screenshot"));
    expect(shots.length).toBeLessThanOrEqual(48);
  });

  it("builds a palette-based ffmpeg filter for GIF quality", async () => {
    const { sandbox } = await record({ durationMs: 1000, fps: 2 });
    const ff = sandbox.execCalls.find((c) => c.command.includes("ffmpeg"))!.command;

    expect(ff).toContain("palettegen=max_colors=128");
    expect(ff).toContain("paletteuse=dither=bayer");
    expect(ff).toContain("-loop 0");
  });

  it("cleans up the frame directory on success", async () => {
    const { sandbox } = await record({ durationMs: 1000, fps: 2 });
    expect(sandbox.ranCommandContaining("rm -rf /tmp/whrec-")).toBe(true);
  });

  it("reports frame count, fps, path, and size", async () => {
    const { output } = await record({ durationMs: 1000, fps: 2 });

    expect(output).toMatch(/Recorded \d+ frames @ 2fps/);
    expect(output).toContain("/out/a.gif");
    expect(output).toContain("(10 KiB)");
    expect(output).toContain("upload_image");
  });

  it("reports a GIF assembly failure with context and cleans up", async () => {
    const { output, sandbox } = await record(
      { durationMs: 1000, fps: 2 },
      { ...okExec, ffmpeg: { exitCode: 1, stderr: "codec missing" } },
    );

    expect(output).toContain("GIF assembly failed");
    expect(output).toContain("codec missing");
    expect(sandbox.ranCommandContaining("rm -rf /tmp/whrec-")).toBe(true);
  });

  it("creates the output directory before assembling", async () => {
    const { sandbox } = await runTool(
      browser,
      { action: "record", savePath: "/deep/out/a.gif", durationMs: 1000, fps: 2 },
      { sandbox: { exec: okExec } },
    );
    expect(sandbox.ranCommandContaining("mkdir -p '/deep/out'")).toBe(true);
  });
});
