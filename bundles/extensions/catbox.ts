// Pi extension: Workhorse image upload (sandbox half).
//
// One decoupled tool that uploads a local image to catbox.moe and returns the
// permanent public URL. Catbox's anonymous API is a single multipart POST with
// no key and no account, so we call it DIRECTLY from Node (built-in fetch +
// FormData + Blob) — no CLI, no Python, no bundled runtime. Lighter image,
// nothing to version-drift, and the upload path is fully under our control.
//
// Kept separate from the browser tools on purpose: it uploads ANY image file,
// not just screenshots — screenshot → upload → PR is just one composition.
//
// Gating: custom tool — a workflow stage must name "upload_image" in its
// tools[] with an object-spec classification or pi-workflow blocks it.

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const CATBOX_API = "https://catbox.moe/user/api.php";
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST the file to catbox, retrying transient failures so it's dependable. */
async function uploadToCatbox(path: string): Promise<string> {
  const buf = readFileSync(path);
  const name = basename(path);
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fd = new FormData();
      fd.append("reqtype", "fileupload");
      fd.append("fileToUpload", new Blob([buf], { type }), name);
      const res = await fetch(CATBOX_API, { method: "POST", body: fd });
      const body = (await res.text()).trim();
      if (res.ok && /^https:\/\/files\.catbox\.moe\/\S+$/.test(body)) return body;
      // Catbox returns plain-text errors (e.g. rate/size) with 200 sometimes.
      lastErr = `HTTP ${res.status}: ${body.slice(0, 200) || "(empty)"}`;
    } catch (e) {
      lastErr = String(e).slice(0, 200);
    }
    if (attempt < 3) await sleep(attempt * 1500);
  }
  throw new Error(lastErr || "upload failed");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "upload_image",
    label: "Upload image (catbox)",
    description:
      "Upload a local image file to catbox.moe and return its permanent public URL — use it to " +
      "embed an image (e.g. a screenshot captured with browser_screenshot savePath) in a PR " +
      "description or a markdown file. Catbox is free, permanent, and needs no account. Returns " +
      "the plain URL, or a markdown image tag when format='markdown'.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the local image file (png/jpg/gif/webp)" }),
      format: Type.Optional(
        Type.Union([Type.Literal("plain"), Type.Literal("markdown"), Type.Literal("html")], {
          description: "Output form: plain URL (default), markdown ![](url), or html <img>",
        }),
      ),
      alt: Type.Optional(Type.String({ description: "Alt text for markdown/html forms" })),
    }),
    async execute(_id, params) {
      let url: string;
      try {
        url = await uploadToCatbox(params.path);
      } catch (e) {
        return textResult(
          `upload_image: catbox upload of ${params.path} failed: ${String(e)}. ` +
            `Do not fabricate a URL — report the failure.`,
        );
      }
      const alt = params.alt ?? "screenshot";
      const rendered =
        params.format === "markdown"
          ? `![${alt}](${url})`
          : params.format === "html"
            ? `<img src="${url}" alt="${alt}">`
            : url;
      return textResult(`Uploaded ${params.path} to catbox:\n${rendered}`);
    },
  });
}
