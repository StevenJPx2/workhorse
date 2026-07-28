// browser_screenshot — PNG screenshot → path (upload with upload_image).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field, fileKiB, q } from "./_shared";

/** Directory portion of a path, or /tmp when there isn't one. */
const dirOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "/tmp";
};

export default tool({
  name: "browser_screenshot",
  description:
    "Take a PNG screenshot of the current page and write it to savePath (default a temp path). " +
    "Returns the saved path — pass it to upload_image for a hosted URL to embed in a PR. Call " +
    "browser_open first.",
  docs: `
browser_screenshot — PNG of the current page.

ARGUMENTS
  savePath  destination (default /tmp/whshot-<timestamp>.png)
  fullPage  capture the whole scrollable page, not just the viewport

Returns the saved path and size. A 0 KiB report means the capture failed.

EXAMPLES

  { savePath: "/tmp/before.png" }
  { savePath: "/tmp/full.png", fullPage: true }

NOTES
  Write to /workspace or /tmp, NOT into the repo — a stray PNG in the diff is
  noise in the PR. Pass the returned path to upload_image for a hosted URL you
  can embed in a PR description.
`,
  input: v.object({ savePath: v.optional(v.string()), fullPage: v.optional(v.boolean()) }),
  async run({ input, sandbox }) {
    const requested = input.savePath ?? `/tmp/whshot-${Date.now()}.png`;
    await sandbox.exec(`mkdir -p ${q(dirOf(requested))}`, { timeout: 10_000 });

    const args = ["screenshot"];
    if (input.fullPage) args.push("--full");
    args.push(requested);
    const raw = await ab(sandbox, args);

    // The CLI reports where it actually wrote (data.path) — trust that over the
    // requested path, since it may relocate or extension-correct.
    const path = field(raw, "path") ?? requested;
    const kib = await fileKiB(sandbox, path);

    return `Screenshot saved to ${path} (${kib} KiB). Upload with upload_image for a hosted URL.`;
  },
});
