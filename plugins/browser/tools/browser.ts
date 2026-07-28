// browser — the READ-ONLY half of the browser plane, one tool, many actions.
//
// Consolidated deliberately. Every tool in a stage's allowlist costs prompt
// tokens for its name, description, and JSON schema on EVERY turn, so five
// separate read tools cost five descriptions the agent mostly doesn't need.
// One tool with an `action` picklist costs one, and `help: true` returns the
// per-action detail on demand.
//
// The split from browser_interact is NOT stylistic — it is the capability gate.
// A stage allowlist is the security boundary (read-only stages get read-only
// tools), so read actions and page-mutating actions cannot share a tool name
// or granting "look at the page" would also grant "click things".

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field, fileKiB, q } from "./_shared";

const MAX_WAIT_MS = 8000;
const DEFAULT_DEPTH = 10;

/** Directory portion of a path, or /tmp when there isn't one. */
const dirOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "/tmp";
};

export default tool({
  name: "browser",
  description:
    "Read a live web page in the persistent browser session: open (navigate), snapshot (AX tree " +
    "with @refs), read (rendered text), screenshot (PNG), record (GIF). Call open first; the " +
    "session persists across calls for the whole run. To click/type/scroll, use browser_interact.",
  docs: `
browser — read-only browser actions over one persistent session per run.

ACTIONS

open — navigate to a URL. Call this before any other action.
  url       (required) the URL to load
  waitMs    optional settle delay after navigation, capped at ${MAX_WAIT_MS}ms
  waitFor   optional load state to wait for instead: load | domcontentloaded | networkidle
            (preferred over waitMs — it waits for a real signal, not a guess)
  Returns the URL actually landed on, so redirects are visible.

snapshot — accessibility tree with element refs (@e1, @e2, …) for browser_interact.
  interactiveOnly  default true — only actionable elements. This is the token win;
                   set false only when you need static text structure.
  compact          default true — drop empty structural wrappers
  depth            default ${DEFAULT_DEPTH} — raise for deeply nested UI
  selector         scope the tree to one CSS selector (e.g. "#main")
  urls             include href URLs for links
  Refs are INVALIDATED by navigation or DOM mutation — re-snapshot after acting.

read — the page's rendered text/markdown (JS executed, live DOM).
  url       optional — navigate and read in one call
  filter    optional CSS selector to extract just that region
  For static public pages prefer web_read (cheaper); use this for SPAs,
  authenticated pages, and state-dependent content.

screenshot — PNG of the current page.
  savePath  optional destination (default /tmp/whshot-<ts>.png)
  fullPage  capture the whole scrollable page, not just the viewport
  Returns the saved path + size. Pass the path to upload_image for a hosted
  URL to embed in a PR.

record — short animated GIF of the current page.
  savePath   (required) destination .gif
  durationMs default 6000, capped at 12000
  fps        default 2, clamped to 1-4
  script     optional JS to run before capture (e.g. a scroll or click)
  Captures timed frames and assembles them with ffmpeg. Needs >= 2 frames.

EXAMPLES

  { action: "open", url: "http://localhost:3000", waitFor: "networkidle" }
  { action: "snapshot" }
  { action: "read", filter: "main" }
  { action: "screenshot", savePath: "/tmp/before.png", fullPage: true }
  { action: "record", savePath: "/tmp/demo.gif", durationMs: 4000, script: "window.scrollTo(0,600)" }

NOTES
  Bot-walled sites (PerimeterX and similar) deny headless Chrome regardless of
  provider — if a page returns an access-denied interstitial, report that rather
  than retrying.
`,
  input: v.object({
    action: v.picklist(["open", "snapshot", "read", "screenshot", "record"]),
    // open / read
    url: v.optional(v.string()),
    waitMs: v.optional(v.number()),
    waitFor: v.optional(v.picklist(["load", "domcontentloaded", "networkidle"])),
    filter: v.optional(v.string()),
    // snapshot
    interactiveOnly: v.optional(v.boolean()),
    compact: v.optional(v.boolean()),
    depth: v.optional(v.number()),
    selector: v.optional(v.string()),
    urls: v.optional(v.boolean()),
    // screenshot / record
    savePath: v.optional(v.string()),
    fullPage: v.optional(v.boolean()),
    durationMs: v.optional(v.number()),
    fps: v.optional(v.number()),
    script: v.optional(v.string()),
  }),
  run({ input, sandbox }) {
    switch (input.action) {
      case "open":
        return openPage(sandbox, input);
      case "snapshot":
        return snapshotPage(sandbox, input);
      case "read":
        return readPage(sandbox, input);
      case "screenshot":
        return capture(sandbox, input);
      case "record":
        return recordGif(sandbox, input);
    }
  },
});

type Sandbox = Parameters<typeof ab>[0];

/** Navigate, optionally settling first. */
async function openPage(
  sandbox: Sandbox,
  input: { url?: string; waitMs?: number; waitFor?: string },
): Promise<string> {
  if (!input.url) return 'browser: action "open" needs a url.';

  // `open` has NO --wait flag; waiting is a separate `wait` command, so a
  // settle becomes a two-command batch — still one container exec.
  const wait = input.waitFor
    ? `wait --load ${input.waitFor}`
    : input.waitMs && input.waitMs > 0
      ? `wait ${Math.min(Math.round(input.waitMs), MAX_WAIT_MS)}`
      : null;

  const raw = wait
    ? await ab(sandbox, ["batch", "--bail", `open ${input.url}`, wait])
    : await ab(sandbox, ["open", input.url]);

  const landed = field(raw, "url");
  if (landed) return `Browser open: ${landed}`;

  const trimmed = raw.trim();
  if (!trimmed) return `Opened ${input.url}`;
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? `Browser open: ${input.url}` : trimmed;
}

/** Accessibility tree with element refs. */
async function snapshotPage(
  sandbox: Sandbox,
  input: { interactiveOnly?: boolean; compact?: boolean; urls?: boolean; selector?: string; depth?: number },
): Promise<string> {
  const args = ["snapshot"];
  if (input.interactiveOnly ?? true) args.push("-i");
  if (input.compact ?? true) args.push("-c");
  if (input.urls) args.push("-u");
  if (input.selector) args.push("-s", input.selector);
  args.push("-d", String(Math.max(1, Math.round(input.depth ?? DEFAULT_DEPTH))));

  const raw = await ab(sandbox, args);
  return field(raw, "snapshot") ?? raw;
}

/** Rendered page text/markdown. */
async function readPage(sandbox: Sandbox, input: { url?: string; filter?: string }): Promise<string> {
  const args = ["read"];
  if (input.url) args.push(input.url);
  if (input.filter) args.push("--filter", input.filter);

  const raw = await ab(sandbox, args);
  // Page text lives at data.content — a top-level read returns the envelope.
  return field(raw, "content", "text") ?? raw;
}

/** PNG screenshot to a path. */
async function capture(sandbox: Sandbox, input: { savePath?: string; fullPage?: boolean }): Promise<string> {
  const requested = input.savePath ?? `/tmp/whshot-${Date.now()}.png`;
  await sandbox.exec(`mkdir -p ${q(dirOf(requested))}`, { timeout: 10_000 });

  const args = ["screenshot"];
  if (input.fullPage) args.push("--full");
  args.push(requested);
  const raw = await ab(sandbox, args);

  // Trust the path the CLI reports — it may relocate or correct the extension.
  const path = field(raw, "path") ?? requested;
  const kib = await fileKiB(sandbox, path);
  return `Screenshot saved to ${path} (${kib} KiB). Upload with upload_image for a hosted URL.`;
}

/** Timed frame capture + ffmpeg GIF assembly (agent-browser's own `record` yields WebM, which PRs don't inline). */
async function recordGif(
  sandbox: Sandbox,
  input: { savePath?: string; durationMs?: number; fps?: number; script?: string },
): Promise<string> {
  if (!input.savePath) return 'browser: action "record" needs a savePath for the GIF.';
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
  let frames = 0;

  while (Date.now() - started < durationMs && frames < maxFrames) {
    const tick = Date.now();
    await ab(sandbox, ["screenshot", `${tmp}/f${String(frames).padStart(3, "0")}.jpg`]);
    frames++;
    const elapsed = Date.now() - tick;
    if (elapsed < intervalMs) await new Promise((r) => setTimeout(r, intervalMs - elapsed));
  }

  if (frames < 2) {
    await sandbox.exec(`rm -rf ${tmp}`);
    return "Recording too short — captured fewer than 2 frames.";
  }

  await sandbox.exec(`mkdir -p ${q(dirOf(input.savePath))}`);
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

  const kib = await fileKiB(sandbox, input.savePath);
  await sandbox.exec(`rm -rf ${tmp}`);
  return `Recorded ${frames} frames @ ${fps}fps → ${input.savePath} (${kib} KiB). Upload with upload_image for a hosted URL.`;
}
