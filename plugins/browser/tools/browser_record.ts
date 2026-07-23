// browser_record — timed frame capture → animated GIF (native ffmpeg).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, q } from "./_shared";

export default tool({
  name: "browser_record",
  description:
    "Record a short animation of the current page as a GIF. Captures timed screenshot frames " +
    "via the persistent session (optionally running a script first — e.g. a scroll or click) and " +
    "assembles them with native ffmpeg. Writes the GIF to savePath; upload with upload_image. " +
    "Max 12s, 1–4 fps. Call browser_open first.",
  input: v.object({
    savePath: v.string(),
    durationMs: v.optional(v.number()),
    fps: v.optional(v.number()),
    script: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    const durationMs = Math.min(input.durationMs ?? 6000, 12_000);
    const fps = Math.min(Math.max(input.fps ?? 2, 1), 4);
    const intervalMs = Math.round(1000 / fps);
    const maxFrames = Math.ceil(durationMs / intervalMs);

    if (input.script) {
      await ab(sandbox, ["eval", input.script]);
      await new Promise((r) => setTimeout(r, 300));
    }

    const tmp = `/tmp/whrec-${Date.now()}`;
    await sandbox.exec(`mkdir -p ${tmp}`);
    const started = Date.now();
    let frameIdx = 0;
    while (Date.now() - started < durationMs && frameIdx < maxFrames) {
      const tick = Date.now();
      await ab(sandbox, ["screenshot", `${tmp}/f${String(frameIdx).padStart(3, "0")}.jpg`]);
      frameIdx++;
      const elapsed = Date.now() - tick;
      if (elapsed < intervalMs) await new Promise((r) => setTimeout(r, intervalMs - elapsed));
    }
    if (frameIdx < 2) {
      await sandbox.exec(`rm -rf ${tmp}`);
      return "Recording too short — captured fewer than 2 frames.";
    }
    await sandbox.exec(`mkdir -p ${q(input.savePath.replace(/\/[^/]+$/, "") || "/tmp")}`);
    const ff = await sandbox.exec(
      `ffmpeg -y -framerate ${fps} -i ${tmp}/f%03d.jpg ` +
        `-vf 'split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer' ` +
        `-loop 0 ${q(input.savePath)}`,
      { timeout: 60_000 },
    );
    if (ff.exitCode !== 0) {
      await sandbox.exec(`rm -rf ${tmp}`);
      return `GIF assembly failed: ${ff.stderr.slice(-300)}`;
    }
    const stat = await sandbox.exec(`stat -c %s ${q(input.savePath)} 2>/dev/null || echo 0`);
    const kib = Math.round(Number(stat.stdout.trim() || "0") / 1024);
    await sandbox.exec(`rm -rf ${tmp}`);
    return `Recorded ${frameIdx} frames @ ${fps}fps → ${input.savePath} (${kib} KiB). Upload with upload_image for a hosted URL.`;
  },
});
