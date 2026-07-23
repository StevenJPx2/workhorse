// browser_screenshot — PNG screenshot → path (upload with upload_image).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, q } from "./_shared";

export default tool({
  name: "browser_screenshot",
  description:
    "Take a PNG screenshot of the current page and write it to savePath (default a temp path). " +
    "Returns the saved path — pass it to upload_image for a hosted URL to embed in a PR. Call " +
    "browser_open first.",
  input: v.object({ savePath: v.optional(v.string()), fullPage: v.optional(v.boolean()) }),
  async run({ input, sandbox }) {
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
});
