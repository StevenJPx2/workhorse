// The `screenshot-pr` workflow — single-stage: capture a web page, host the
// image, write it into the repo as markdown, and open a PR embedding it.
// SCAFFOLDING, like coding/coding-raw. Uses the `shooter` agent block.

import type { StageSpec } from "../types";
import type { WorkflowContext, WorkflowDef, WorkflowResult } from "../context";

const stages: StageSpec[] = [
  {
    id: "shoot",
    type: "single",
    thinking: "low",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "write", classification: "read-only" },
      { name: "bash", classification: "read-only" },
      { name: "browser_open", classification: "read-only" },
      { name: "browser_screenshot", classification: "read-only" },
      { name: "browser_record", classification: "read-only" },
      { name: "upload_image", classification: "read-only" },
    ],
    prompt:
      "The task names a web page URL to capture. Steps: (1) browser_screenshot that URL with savePath=/workspace/shot.png (OUTSIDE the repo, so the raw PNG stays out of the diff); if the page is JS-heavy pass waitMs around 2000. (2) upload_image /workspace/shot.png to get a permanent public URL (it tries several keyless hosts and returns one whose URL actually serves the image). If it reports every host failed, say so in the file — do not invent a URL. (3) write a markdown file in the repo root — use the filename the task requests, else SCREENSHOT.md — that embeds the hosted image with ![alt](url) and includes a short heading, the source URL, and today's date. Do NOT commit the PNG itself. If the screenshot or upload truly fails, write the file stating what failed rather than inventing a URL. Then verify with bash: git add -A && git diff --cached --stat, and include that in your analysis.",
    output: { analysis: { required: true }, maxDigestChars: 1500 },
    outcome: "pr",
  },
];

export const screenshotPr: WorkflowDef = {
  name: "screenshot-pr",
  description: "Screenshot a web page, host the image, write it into the repo as markdown, and open a PR embedding it.",
  defaults: { agent: "shooter" },
  stages,

  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const shot = await ctx.stage("shoot");
    return { outcome: "pr", summary: String(shot.analysis).slice(0, 200) };
  },
};
