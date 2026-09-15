// browser_record — record the page as an animated GIF.
//
// Uses agent-browser's NATIVE `record start` / `record stop`, which captures a
// real WebM at the browser's own frame rate, then converts once with ffmpeg.
//
// This replaced a hand-rolled frame loop that called `screenshot` on a
// wall-clock timer (one container exec per frame, capped at 4fps, and its
// duration was real elapsed time). Native recording is ~3 execs regardless of
// length and yields far smoother output: a 10.6s capture produced 106 frames
// (~10fps) where the loop would have managed ~42 at its 4fps ceiling.
//
// GIF rather than shipping the WebM directly because GitHub renders a GIF
// inline in a PR description and does not render WebM.

import { tool } from "@workhorse/api";
import type { SandboxHandle } from "@workhorse/api";
import { ab, fileKiB, numField, q } from "./_shared";

import * as v from "valibot";

/** Upper bound on a recording, so a runaway wait can't stall a stage. */
const MAX_DURATION_MS = 30_000;
/** GIF frame rate — 10 reads as smooth motion without ballooning the file. */
const GIF_FPS = 10;
/** Cap width so a retina viewport doesn't produce a multi-MB GIF. */
const GIF_WIDTH = 900;

/** Directory portion of a path, or /tmp when there isn't one. */
const dirOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "/tmp";
};

export default tool({
  name: "browser_record",
  description:
    "Record the current page as an animated GIF — use it to show a FLOW (a scroll, a transition, " +
    "an interaction) in a PR description. Optionally runs a script during capture. Call " +
    "browser_open first; pass the result to upload_image for a hosted URL.",
  docs: `
browser_record — short animated GIF of the current page.

Records natively at the browser's own frame rate, then converts to GIF (GitHub
renders a GIF inline in a PR; it does not render WebM).

ARGUMENTS
  savePath    (required) destination .gif
  durationMs  how long to record, default 5000, capped at ${MAX_DURATION_MS}
  script      optional JS to run WHILE recording (e.g. a scroll or a click)

EXAMPLES

  { savePath: "/tmp/demo.gif" }
  { savePath: "/tmp/scroll.gif", durationMs: 4000, script: "window.scrollTo(0, 800)" }

NOTES
  Use this for MOTION. A single state is better served by browser_screenshot —
  cheaper, sharper, and smaller.
  Recording starts a fresh browser context (cookies and localStorage are
  preserved) and continues from the current URL.
  Write to /workspace or /tmp, NOT into the repo.
`,
  input: v.object({
    savePath: v.string(),
    durationMs: v.optional(v.number()),
    script: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    const durationMs = Math.min(Math.max(input.durationMs ?? 5000, 500), MAX_DURATION_MS);
    const webm = `/tmp/whrec-${Date.now()}.webm`;

    await sandbox.exec(`mkdir -p ${q(dirOf(input.savePath))}`, { timeout: 10_000 });

    const started = await ab(sandbox, ["record", "start", webm]);
    if (/error/i.test(started) && !started.trim().startsWith("{")) {
      return `Recording failed to start: ${started.slice(0, 300)}`;
    }

    // Whatever should appear in the video has to happen between start and stop.
    if (input.script) await ab(sandbox, ["eval", input.script]);
    await new Promise((resolve) => setTimeout(resolve, durationMs));

    const stopped = await ab(sandbox, ["record", "stop"]);
    const frames = numField(stopped, "frames");

    const gif = await toGif(sandbox, webm, input.savePath);
    if (gif) return gif;

    const kib = await fileKiB(sandbox, input.savePath);
    const frameNote = frames ? ` from ${frames} frames` : "";
    return `Recorded ${Math.round(durationMs / 1000)}s${frameNote} → ${input.savePath} (${kib} KiB). Upload with upload_image for a hosted URL.`;
  },
});

/** Convert WebM → GIF. Returns an error string, or null on success. */
async function toGif(sandbox: SandboxHandle, webm: string, gifPath: string): Promise<string | null> {
  const filter =
    `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,` +
    `split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`;

  const ff = await sandbox.exec(`ffmpeg -y -i ${q(webm)} -vf ${q(filter)} -loop 0 ${q(gifPath)}`, {
    timeout: 120_000,
  });

  // Clean up the intermediate either way — it is several times the GIF's size.
  await sandbox.exec(`rm -f ${q(webm)}`);

  if (ff.exitCode !== 0) {
    return `Recording captured but GIF conversion failed: ${ff.stderr.slice(-300)}`;
  }
  return null;
}
