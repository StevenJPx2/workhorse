// Stage tools: image upload (flue engine).
//
// The flue port of extension.ts (CLI-exec archetype, sibling of aft): the
// tool definition runs worker-side, the `imgup` CLI (images-upload-cli,
// baked into the sandbox image) runs in the container via the sandbox
// handle. imgup speaks 30+ hosts; we try a chain of PERMANENT, KEYLESS
// hosts and return the FIRST whose URL actually serves the bytes back — a
// host can mint a URL yet store nothing (observed with catbox), so we
// confirm, we don't trust.

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory, SandboxHandle } from "@workhorse/api";
import * as v from "valibot";

// Permanent, keyless hosts that accept uploads from datacenter IPs (imgbox +
// pixhost serve real bytes; catbox mints a URL but often stores nothing, so
// it's last and only survives because the serve-check rejects empty results).
const DEFAULT_HOSTS = ["imgbox", "pixhost", "catbox"];
const IMGUP_BIN = "/usr/local/bin/imgup";

/** GET the URL and confirm it serves a non-empty image (mint != stored). */
async function servesBytes(url: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.length > 100; // real images are KBs; guard 0-byte / error pages
  } catch {
    return false;
  }
}

/** Run imgup for one host in the container; return the first URL it prints, or null. */
async function uploadVia(sandbox: SandboxHandle, host: string, path: string): Promise<string | null> {
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const r = await sandbox.exec(
    `${IMGUP_BIN} -H ${q(host)} -f plain --no-clipboard ${q(path)}`,
    { timeout: 90_000 },
  );
  if (r.exitCode !== 0) return null;
  const m = r.stdout.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

export const imgupTools: PluginToolFactory = ({ sandbox }) => [
  defineTool({
    name: "upload_image",
    description:
      "Upload a local image file (in the workspace) to a public image host and return its hosted " +
      "URL — use it to embed an image (e.g. a screenshot, or a GIF from browser_record) in a PR " +
      "description or a markdown file. Tries several permanent, keyless hosts in order and returns " +
      "the first URL that actually serves the image. Returns the plain URL, or a markdown/html tag.",
    input: v.object({
      path: v.string(),
      format: v.optional(v.picklist(["plain", "markdown", "html"])),
      alt: v.optional(v.string()),
      hosts: v.optional(v.array(v.string())),
    }),
    async run({ input }) {
      const check = await sandbox.exec(`test -f '${input.path.replace(/'/g, "'\\''")}' && echo yes || echo no`);
      if (!check.stdout.includes("yes")) {
        return `upload_image: file not found at ${input.path}. Capture it first (e.g. browser_screenshot / browser_record).`;
      }
      const hosts = input.hosts?.length ? input.hosts : DEFAULT_HOSTS;
      const tried: string[] = [];
      for (const host of hosts) {
        const url = await uploadVia(sandbox, host, input.path);
        if (url && (await servesBytes(url))) {
          const alt = input.alt ?? "image";
          const rendered =
            input.format === "markdown"
              ? `![${alt}](${url})`
              : input.format === "html"
                ? `<img src="${url}" alt="${alt}">`
                : url;
          return `Uploaded ${input.path} via ${host}:\n${rendered}`;
        }
        tried.push(url ? `${host}(minted but served empty)` : `${host}(failed)`);
      }
      return `upload_image: every host failed for ${input.path}: ${tried.join(", ")}. Do not fabricate a URL — report the failure.`;
    },
  }),
];
