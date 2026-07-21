// Pi extension: Workhorse image upload (sandbox half).
//
// Uploads a local image to a public host via the imgup CLI (images-upload-cli,
// baked into the sandbox image) and returns a hosted URL. imgup speaks 30+
// hosts; we try a chain of PERMANENT, KEYLESS hosts in order and return the
// FIRST whose URL actually serves the bytes back. Verification matters: a host
// can mint a URL yet store nothing (observed with catbox), and some hosts
// throttle datacenter IPs — so we confirm, we don't trust.
//
// Kept separate from the browser tools on purpose: it uploads ANY image file,
// not just screenshots — screenshot → upload → PR is just one composition.
//
// Gating: custom tool — a workflow stage must name "upload_image" in its
// tools[] with an object-spec classification or pi-workflow blocks it.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const run = promisify(execFile);

// Permanent, keyless hosts that actually accept uploads from datacenter IPs
// (verified from the sandbox: imgbox + pixhost serve real bytes; catbox mints
// a URL but often stores nothing, so it's last and only survives because the
// serve-check below rejects its empty results; postimages/imgchest/freeimage/
// lensdump/thumbsnap all require API keys and are deliberately excluded). The
// tool falls through on failure so one flaky/blocking host never breaks it.
const DEFAULT_HOSTS = ["imgbox", "pixhost", "catbox"];

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

/** GET the URL and confirm it serves a non-empty image (mint != stored). */
async function servesBytes(url: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 100; // real images are KBs; guard 0-byte / error pages
  } catch {
    return false;
  }
}

/** Run imgup for one host; return the first URL it prints, or null. */
async function uploadVia(bin: string, host: string, path: string): Promise<string | null> {
  try {
    const { stdout } = await run(bin, ["-H", host, "-f", "plain", "--no-clipboard", path], {
      timeout: 90_000,
      maxBuffer: 1 << 20,
    });
    const m = stdout.match(/https?:\/\/\S+/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "upload_image",
    label: "Upload image",
    description:
      "Upload a local image file to a public image host and return its hosted URL — use it to " +
      "embed an image (e.g. a screenshot captured with browser_screenshot savePath) in a PR " +
      "description or a markdown file. Tries several permanent, keyless hosts in order and " +
      "returns the first URL that actually serves the image, so a single flaky host never " +
      "breaks it. Returns the plain URL, or a markdown image tag when format='markdown'.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the local image file (png/jpg/gif/webp)" }),
      format: Type.Optional(
        Type.Union([Type.Literal("plain"), Type.Literal("markdown"), Type.Literal("html")], {
          description: "Output form: plain URL (default), markdown ![](url), or html <img>",
        }),
      ),
      alt: Type.Optional(Type.String({ description: "Alt text for markdown/html forms" })),
      hosts: Type.Optional(
        Type.Array(Type.String(), {
          description: "Override the host fallback order (default: imgbox, catbox, postimages, …)",
        }),
      ),
    }),
    async execute(_id, params) {
      if (!existsSync(params.path)) {
        return textResult(
          `upload_image: file not found at ${params.path}. Capture it first (e.g. browser_screenshot with savePath).`,
        );
      }
      const bin = process.env.WORKHORSE_IMGUP_BIN || "/usr/local/bin/imgup";
      const hosts = params.hosts?.length ? params.hosts : DEFAULT_HOSTS;
      const tried: string[] = [];
      for (const host of hosts) {
        const url = await uploadVia(bin, host, params.path);
        if (url && (await servesBytes(url))) {
          const alt = params.alt ?? "screenshot";
          const rendered =
            params.format === "markdown"
              ? `![${alt}](${url})`
              : params.format === "html"
                ? `<img src="${url}" alt="${alt}">`
                : url;
          return textResult(`Uploaded ${params.path} via ${host}:\n${rendered}`);
        }
        tried.push(url ? `${host}(minted but served empty)` : `${host}(failed)`);
      }
      return textResult(
        `upload_image: every host failed for ${params.path}: ${tried.join(", ")}. ` +
          `Do not fabricate a URL — report the failure.`,
      );
    },
  });
}
