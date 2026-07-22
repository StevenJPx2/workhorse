// Pi extension: Workhorse browser tools (sandbox half).
//
// Stateful browser via agent-browser (CLI daemon, persistent sessions):
//   browser_open       — open/navigate a URL (starts daemon + session)
//   browser_snapshot   — accessibility tree with element refs (token-cheap)
//   browser_read       — rendered page text/markdown (JS-capable read)
//   browser_act        — click/fill/type/scroll/select/hover by AX ref
//   browser_screenshot — PNG screenshot of current page
//   browser_record     — timed frame capture → animated GIF (ffmpeg)
//
// The daemon starts lazily on first call and lives for the container's
// lifetime (one session = one ticket run). agent-browser-wrapper handles
// daemon lifecycle; the extension shells out to it for every call.
//
// Gating: custom tools — a workflow stage must name them in tools[] with
// an object-spec classification ("read-only" | "write-capable"). Off by
// default in every stage.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const WRAPPER = "/usr/local/bin/agent-browser-wrapper";

function ab(...args: string[]): string {
  try {
    return execFileSync(WRAPPER, args, { timeout: 60_000, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`agent-browser ${args[0]}: ${(err.stderr ?? err.message ?? "").slice(0, 500)}`);
  }
}

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "browser_open",
    label: "Browser: open",
    description:
      "Open or navigate to a URL in the persistent browser session (one per ticket run). " +
      "Starts the daemon on the first call (~1s); subsequent calls reuse the session. " +
      "Always call this before browser_snapshot / browser_act / browser_screenshot.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL to navigate to" }),
      waitMs: Type.Optional(Type.Number({ description: "Extra settle time after load (ms), max 8000" })),
    }),
    async execute(_id, params) {
      const args = ["open", params.url];
      if (params.waitMs && params.waitMs > 0) args.push("--wait", String(Math.min(params.waitMs, 8000)));
      const raw = ab(...args);
      try {
        const j = JSON.parse(raw) as { url?: string };
        return textResult(`Browser open: ${j.url ?? params.url}`);
      } catch {
        return textResult(raw.trim() || `Opened ${params.url}`);
      }
    },
  });

  pi.registerTool({
    name: "browser_snapshot",
    label: "Browser: snapshot (AX tree)",
    description:
      "Get the accessibility tree of the current page with element refs (@e1, @e2, …). " +
      "Interactive elements only by default (buttons, inputs, links) — far cheaper in tokens " +
      "than raw HTML. Use browser_act to interact by ref. Call browser_open first.",
    parameters: Type.Object({
      depth: Type.Optional(Type.Number({ description: "Max tree depth (default 10)" })),
      compact: Type.Optional(Type.Boolean({ description: "Remove empty structural elements (default true)" })),
    }),
    async execute() {
      const raw = ab("snapshot", "-i", "-c", "-d", "10");
      // agent-browser --json snapshot returns {snapshot: "..."} or raw text.
      try {
        const j = JSON.parse(raw) as { snapshot?: string };
        return textResult(j.snapshot ?? raw);
      } catch {
        return textResult(raw);
      }
    },
  });

  pi.registerTool({
    name: "browser_read",
    label: "Browser: read page",
    description:
      "Read the current page's rendered content as text or markdown (JS executed, live DOM). " +
      "Omit url to read the active tab; pass a URL to navigate+read in one call. " +
      "For static content prefer web_read (Jina, no browser needed); this tool handles " +
      "JS-heavy SPAs, authenticated pages, and browser-state-dependent content.",
    parameters: Type.Object({
      url: Type.Optional(Type.String({ description: "URL to navigate to before reading (optional)" })),
      filter: Type.Optional(Type.String({ description: "Filter to matching page sections" })),
    }),
    async execute(_id, params) {
      const args = ["read"];
      if (params.url) args.push(params.url);
      if (params.filter) args.push("--filter", params.filter);
      const raw = ab(...args);
      try {
        const j = JSON.parse(raw) as { content?: string; text?: string };
        return textResult(j.content ?? j.text ?? raw);
      } catch {
        return textResult(raw);
      }
    },
  });

  pi.registerTool({
    name: "browser_act",
    label: "Browser: act",
    description:
      "Perform an action on a page element by its ref from browser_snapshot. " +
      "Use snapshot refs (@e1, @e2, …) for selectors. Supports: click, dblclick, " +
      "fill, type, press, hover, scroll, select, check, uncheck. " +
      "Always snapshot first to get current refs — they change after navigation or DOM mutation.",
    parameters: Type.Object({
      action: Type.Union(
        [
          Type.Literal("click"),
          Type.Literal("dblclick"),
          Type.Literal("fill"),
          Type.Literal("type"),
          Type.Literal("press"),
          Type.Literal("hover"),
          Type.Literal("scroll"),
          Type.Literal("select"),
          Type.Literal("check"),
          Type.Literal("uncheck"),
        ],
        { description: "Action to perform" },
      ),
      selector: Type.String({ description: "Element ref (@e1) or CSS selector" }),
      value: Type.Optional(
        Type.String({
          description:
            "Value for fill/type/select/press. For press: key name (Enter, Tab, Escape). " +
            "For select: option value. For scroll: direction (up/down/left/right) or px.",
        }),
      ),
    }),
    async execute(_id, params) {
      const args: string[] = [params.action, params.selector];
      if (params.value !== undefined) args.push(params.value);
      const raw = ab(...args);
      try {
        const j = JSON.parse(raw) as { url?: string; title?: string };
        const dest = j.url ? ` → ${j.url}` : "";
        return textResult(`${params.action} ${params.selector}${dest}`);
      } catch {
        return textResult(raw.trim() || `${params.action} ${params.selector}`);
      }
    },
  });

  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser: screenshot",
    description:
      "Take a PNG screenshot of the current page. Returns inline image by default; " +
      "pass savePath to write to disk instead (ideal before upload_image). " +
      "Call browser_open first.",
    parameters: Type.Object({
      fullPage: Type.Optional(Type.Boolean({ description: "Capture full scrollable page (default false, viewport only)" })),
      savePath: Type.Optional(
        Type.String({
          description:
            "Write the PNG to this path instead of returning inline (e.g. /workspace/repo/shot.png). " +
            "Returns saved path — use with upload_image for a public URL.",
        }),
      ),
    }),
    async execute(_id, params) {
      const args = ["screenshot"];
      if (params.fullPage) args.push("--full");
      if (params.savePath) {
        mkdirSync(dirname(params.savePath), { recursive: true });
        args.push(params.savePath);
        ab(...args);
        const size = statSync(params.savePath).size;
        return textResult(
          `Screenshot saved to ${params.savePath} (${(size / 1024).toFixed(0)} KiB). ` +
            "Upload with upload_image for a hosted URL.",
        );
      }
      // Inline: save to temp, read, return as image content.
      const tmp = join(mkdtempSync("/tmp/whshot-"), "shot.png");
      try {
        args.push(tmp);
        ab(...args);
        const b64 = readFileSync(tmp).toString("base64");
        return {
          content: [
            { type: "text" as const, text: "Screenshot captured:" },
            { type: "image" as const, data: b64, mimeType: "image/png" },
          ],
          details: {},
        };
      } finally {
        rmSync(dirname(tmp), { recursive: true, force: true });
      }
    },
  });

  pi.registerTool({
    name: "browser_record",
    label: "Browser: record GIF",
    description:
      "Record a short animation of the current page as a GIF. Captures timed screenshot " +
      "frames via the persistent session (optionally running a script first — e.g. a " +
      "scroll or click) and assembles them with native ffmpeg. Writes the GIF to " +
      "savePath; upload with upload_image for a hosted URL. Max 12s, 1–4 fps. " +
      "Call browser_open first.",
    parameters: Type.Object({
      savePath: Type.String({ description: "Where to write the GIF (e.g. /workspace/repo/demo.gif)" }),
      durationMs: Type.Optional(Type.Number({ description: "Recording length in ms (default 6000, max 12000)" })),
      fps: Type.Optional(Type.Number({ description: "Frames per second, 1–4 (default 2)" })),
      script: Type.Optional(
        Type.String({
          description:
            "JS to run in the page before recording — kick off the thing being recorded, " +
            "e.g. \"window.scrollTo({top: 2000, behavior: 'smooth'})\"",
        }),
      ),
    }),
    async execute(_id, params) {
      const durationMs = Math.min(params.durationMs ?? 6000, 12_000);
      const fps = Math.min(Math.max(params.fps ?? 2, 1), 4);
      const intervalMs = Math.round(1000 / fps);
      const maxFrames = Math.ceil(durationMs / intervalMs);

      if (params.script) {
        ab("eval", params.script);
        await new Promise((r) => setTimeout(r, 300));
      }

      const tmp = mkdtempSync("/tmp/whrec-");
      try {
        const started = Date.now();
        let frameIdx = 0;
        while (Date.now() - started < durationMs && frameIdx < maxFrames) {
          const tick = Date.now();
          ab("screenshot", join(tmp, `f${String(frameIdx).padStart(3, "0")}.jpg`));
          frameIdx++;
          const elapsed = Date.now() - tick;
          if (elapsed < intervalMs) await new Promise((r) => setTimeout(r, intervalMs - elapsed));
        }

        if (frameIdx < 2) return textResult("Recording too short — captured fewer than 2 frames.");

        mkdirSync(dirname(params.savePath), { recursive: true });
        execFileSync(
          "ffmpeg",
          [
            "-y", "-framerate", String(fps), "-i", join(tmp, "f%03d.jpg"),
            "-vf", "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer",
            "-loop", "0", params.savePath,
          ],
          { timeout: 60_000, stdio: "pipe" },
        );
        const size = statSync(params.savePath).size;
        return textResult(
          `Recorded ${frameIdx} frames @ ${fps}fps → ${params.savePath} (${(size / 1024).toFixed(0)} KiB). ` +
            "Upload with upload_image for a hosted URL.",
        );
      } catch (e) {
        return textResult(`GIF assembly failed: ${String(e).slice(0, 300)}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  });
}
