// upload_text — host text/code publicly, return a RAW curl-able URL.
//
// `path` mode reads the file through the sandbox handle (file in the
// container, tool runs worker-side). Host chain: first that VERIFIABLY serves
// the bytes back wins — a host can accept an upload yet serve nothing.

import { tool } from "@workhorse/api";
import * as v from "valibot";

/** Max we'll ship to a public paste host (most cap around 1-2 MB anyway). */
const MAX_BYTES = 1024 * 1024;

/** Confirm the URL serves the content back (prefix match is enough). */
async function servesText(url: string, expectPrefix: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const body = await r.text();
    return body.trimStart().startsWith(expectPrefix.trimStart().slice(0, 64));
  } catch {
    return false;
  }
}

type Uploader = (content: string) => Promise<string | null>;

const uploaders: Record<string, Uploader> = {
  "paste.rs": async (content) => {
    const r = await fetch("https://paste.rs", { method: "POST", body: content });
    if (!r.ok && r.status !== 201) return null;
    const url = (await r.text()).trim();
    return url.startsWith("http") ? url : null;
  },
  "0x0.st": async (content) => {
    const form = new FormData();
    form.append("file", new Blob([content], { type: "text/plain" }), "paste.txt");
    const r = await fetch("https://0x0.st", {
      method: "POST",
      body: form,
      headers: { "user-agent": "workhorse-paste/1.0 (github.com/StevenJPx2/workhorse)" },
    });
    if (!r.ok) return null;
    const url = (await r.text()).trim();
    return url.startsWith("http") ? url : null;
  },
  "dpaste.org": async (content) => {
    const form = new URLSearchParams({ content, format: "url", expires: "365" });
    const r = await fetch("https://dpaste.org/api/", {
      method: "POST",
      body: form,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    if (!r.ok) return null;
    const url = (await r.text()).trim().replace(/"/g, "");
    return url.startsWith("http") ? `${url}/raw` : null;
  },
};

const DEFAULT_HOSTS = ["paste.rs", "0x0.st", "dpaste.org"];

export default tool({
  name: "upload_text",
  description:
    "Host text or code publicly and return a RAW curl-able URL — use it to share repro " +
    "scripts, long logs, full test output, or patches in PR comments and chat replies " +
    "without blowing size limits. Pass either `content` (inline text) or `path` (a file " +
    "in the workspace). Tries several keyless paste hosts and returns the first URL that " +
    "verifiably serves the bytes back. The URL is raw text: `curl <url>` reproduces it exactly.",
  input: v.object({
    content: v.optional(v.string()),
    path: v.optional(v.string()),
    hosts: v.optional(v.array(v.string())),
  }),
  async run({ input, sandbox }) {
    let content = input.content;
    if (!content && input.path) {
      const f = await sandbox.readFile(input.path);
      if (f == null) return `upload_text: file not found at ${input.path}.`;
      content = f;
    }
    if (!content?.trim()) return "upload_text: pass `content` or `path` — nothing to host.";
    if (new TextEncoder().encode(content).length > MAX_BYTES) {
      return "upload_text: content exceeds the 1 MiB paste limit — trim it first.";
    }
    const hosts = input.hosts?.length ? input.hosts : DEFAULT_HOSTS;
    const tried: string[] = [];
    for (const host of hosts) {
      const up = uploaders[host];
      if (!up) {
        tried.push(`${host}(unknown)`);
        continue;
      }
      try {
        const url = await up(content);
        if (url && (await servesText(url, content))) {
          return `Hosted via ${host} (raw, curl-able):\n${url}`;
        }
        tried.push(url ? `${host}(minted but served wrong/empty)` : `${host}(failed)`);
      } catch {
        tried.push(`${host}(error)`);
      }
    }
    return `upload_text: every host failed: ${tried.join(", ")}. Do not fabricate a URL — report the failure.`;
  },
});
