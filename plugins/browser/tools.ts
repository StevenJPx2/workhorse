// Stage tools: stateful browser via agent-browser (flue engine).
//
// The flue port of extension.ts. Every call execs the agent-browser-wrapper
// (and ffmpeg for browser_record) in the container through the sandbox
// handle; the daemon starts lazily on the first call and lives for the
// container's lifetime (one session = one ticket run).
//
//   browser_open       — open/navigate a URL (starts daemon + session)
//   browser_snapshot   — accessibility tree with element refs (token-cheap)
//   browser_read       — rendered page text/markdown (JS-capable)
//   browser_act        — click/fill/type/scroll/select/hover by AX ref
//   browser_screenshot — PNG screenshot → path (upload with upload_image)
//   browser_record     — timed frame capture → animated GIF (ffmpeg)
//
// NOTE: extension.ts could return a screenshot as an INLINE image block for
// the agent to see. flue tool results are JSON/text, so this port writes to
// a path and returns it (the fleet's flow is screenshot→upload_image→PR).
// Inline vision would need a flue image-return mechanism — a cutover follow-up.

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory, SandboxHandle } from "@workhorse/api";
import * as v from "valibot";

const WRAPPER = "/usr/local/bin/agent-browser-wrapper";
const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Exec the agent-browser wrapper with args; return stdout (throws on failure). */
async function ab(sandbox: SandboxHandle, args: string[]): Promise<string> {
  const r = await sandbox.exec(`${WRAPPER} ${args.map(q).join(" ")}`, { timeout: 60_000 });
  if (r.exitCode !== 0) throw new Error(`agent-browser ${args[0]}: ${(r.stderr || r.stdout).slice(0, 500)}`);
  return r.stdout;
}

export const browserTools: PluginToolFactory = ({ sandbox }) => [
  defineTool({
    name: "browser_open",
    description:
      "Open or navigate to a URL in the persistent browser session (one per ticket run). Starts " +
      "the daemon on the first call (~1s); subsequent calls reuse the session. Always call this " +
      "before browser_snapshot / browser_act / browser_screenshot.",
    input: v.object({ url: v.string(), waitMs: v.optional(v.number()) }),
    async run({ input }) {
      const args = ["open", input.url];
      if (input.waitMs && input.waitMs > 0) args.push("--wait", String(Math.min(input.waitMs, 8000)));
      const raw = await ab(sandbox, args);
      try {
        return `Browser open: ${(JSON.parse(raw) as { url?: string }).url ?? input.url}`;
      } catch {
        return raw.trim() || `Opened ${input.url}`;
      }
    },
  }),
  defineTool({
    name: "browser_snapshot",
    description:
      "Get the accessibility tree of the current page with element refs (@e1, @e2, …). Interactive " +
      "elements only by default — far cheaper in tokens than raw HTML. Use browser_act to interact " +
      "by ref. Call browser_open first.",
    input: v.object({ depth: v.optional(v.number()), compact: v.optional(v.boolean()) }),
    async run() {
      const raw = await ab(sandbox, ["snapshot", "-i", "-c", "-d", "10"]);
      try {
        return (JSON.parse(raw) as { snapshot?: string }).snapshot ?? raw;
      } catch {
        return raw;
      }
    },
  }),
  defineTool({
    name: "browser_read",
    description:
      "Read the current page's rendered content as text or markdown (JS executed, live DOM). Omit " +
      "url to read the active tab; pass a URL to navigate+read in one call. For static content " +
      "prefer web_read (Jina); this handles JS-heavy SPAs, authenticated pages, state-dependent content.",
    input: v.object({ url: v.optional(v.string()), filter: v.optional(v.string()) }),
    async run({ input }) {
      const args = ["read"];
      if (input.url) args.push(input.url);
      if (input.filter) args.push("--filter", input.filter);
      const raw = await ab(sandbox, args);
      try {
        const jr = JSON.parse(raw) as { content?: string; text?: string };
        return jr.content ?? jr.text ?? raw;
      } catch {
        return raw;
      }
    },
  }),
  defineTool({
    name: "browser_act",
    description:
      "Perform an action on a page element by its ref from browser_snapshot (@e1, @e2, …). Supports " +
      "click, dblclick, fill, type, press, hover, scroll, select, check, uncheck. Always snapshot " +
      "first — refs change after navigation or DOM mutation.",
    input: v.object({
      action: v.picklist(["click", "dblclick", "fill", "type", "press", "hover", "scroll", "select", "check", "uncheck"]),
      selector: v.string(),
      value: v.optional(v.string()),
    }),
    async run({ input }) {
      const args = [input.action, input.selector];
      if (input.value !== undefined) args.push(input.value);
      const raw = await ab(sandbox, args);
      try {
        const jr = JSON.parse(raw) as { url?: string };
        return `${input.action} ${input.selector}${jr.url ? ` → ${jr.url}` : ""}`;
      } catch {
        return raw.trim() || `${input.action} ${input.selector}`;
      }
    },
  }),
  defineTool({
    name: "browser_screenshot",
    description:
      "Take a PNG screenshot of the current page and write it to savePath (default a temp path). " +
      "Returns the saved path — pass it to upload_image for a hosted URL to embed in a PR. Call " +
      "browser_open first.",
    input: v.object({ savePath: v.optional(v.string()), fullPage: v.optional(v.boolean()) }),
    async run({ input }) {
      const path = input.savePath ?? `/tmp/whshot-${Date.now()}.png`;
      await sandbox.exec(`mkdir -p ${q(path.replace(/\/[^/]+$/, "") || "/tmp")}`);
      const args = ["screenshot"];
      if (input.fullPage) args.push("--full");
      args.push(path);
      await ab(sandbox, args);
      const stat = await sandbox.exec(`stat -c %s ${q(path)} 2>/dev/null || echo 0`);
      const kib = Math.round(Number(stat.stdout.trim() || "0") / 1024);
      return `Screenshot saved to ${path} (${kib} KiB). Upload with upload_image for a hosted URL.`;
    },
  }),
  defineTool({
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
    async run({ input }) {
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
  }),
];
