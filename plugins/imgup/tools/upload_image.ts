// upload_image — upload a workspace image to a public host, return a hosted URL.
//
// CLI-exec archetype: the tool runs worker-side, the `imgup` CLI (baked into
// the image) runs in the container via the sandbox handle. imgup speaks 30+
// hosts; we try a chain and return the FIRST whose URL actually serves the
// bytes back — a host can mint a URL yet store nothing (observed with catbox),
// so we confirm, we don't trust.
//
// imgbb leads the chain: it is API-keyed (IMGBB_KEY, injected into the
// container at prepare) and proved reliable, where the keyless hosts throttle
// datacenter IPs and the GitHub user-attachments path did not work out. The
// keyless hosts remain as fallbacks for when the key is absent.

import { tool } from "@workhorse/api";
import type { SandboxHandle } from "@workhorse/api";
import * as v from "valibot";

/** imgbb first (keyed, reliable), then the keyless permanent hosts. */
const DEFAULT_HOSTS = ["imgbb", "imgbox", "pixhost", "catbox"];
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
  const r = await sandbox.exec(`${IMGUP_BIN} -H ${q(host)} -f plain --no-clipboard ${q(path)}`, { timeout: 90_000 });
  if (r.exitCode !== 0) return null;
  const m = r.stdout.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

export default tool({
  name: "upload_image",
  description:
    "Upload a local image file (in the workspace) to a public image host and return its hosted " +
    "URL — THE way to embed an image (e.g. a screenshot, or a GIF from browser_record) in a PR " +
    "description or a markdown file. Tries imgbb first, then permanent keyless hosts, and returns " +
    "the first URL that actually serves the image. Returns the plain URL, or a markdown/html tag.",
  docs: `
upload_image — host a local image and get a URL that renders in a PR.

THE vehicle for putting a screenshot or GIF into a PR description. Tries hosts
in order and returns the first URL that VERIFIABLY serves the bytes back — a
host can mint a URL and store nothing, so the tool confirms rather than trusts.

ARGUMENTS
  path    (required) the image file IN THE WORKSPACE (capture it first with the
          browser tool's screenshot/record actions)
  format  plain (default) → the bare URL
          markdown        → ![alt](url), ready to paste in a PR body
          html            → <img src="url" alt="alt">
  alt     alt text for markdown/html (default "image")
  hosts   override the host chain (rarely needed)

HOST CHAIN
  imgbb first — it is API-keyed and reliable; the keyless hosts (imgbox,
  pixhost, catbox) follow as fallbacks and can throttle datacenter IPs.

EXAMPLES

  { path: "/tmp/before.png" }
  { path: "/tmp/demo.gif", format: "markdown", alt: "the new flow" }

NOTES
  If every host fails the tool says so — report the failure. NEVER fabricate or
  guess an image URL: a broken embed in a PR is worse than a note saying the
  upload failed.
`,
  input: v.object({
    path: v.string(),
    format: v.optional(v.picklist(["plain", "markdown", "html"])),
    alt: v.optional(v.string()),
    hosts: v.optional(v.array(v.string())),
  }),
  async run({ input, sandbox }) {
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
          input.format === "markdown" ? `![${alt}](${url})` : input.format === "html" ? `<img src="${url}" alt="${alt}">` : url;
        return `Uploaded ${input.path} via ${host}:\n${rendered}`;
      }
      tried.push(url ? `${host}(minted but served empty)` : `${host}(failed)`);
    }
    return `upload_image: every host failed for ${input.path}: ${tried.join(", ")}. Do not fabricate a URL — report the failure.`;
  },
});
