// The PR-body writer.
//
// ONE agent, not two. The visual and text variants differ only in tool surface,
// and `tools` is a function of the invocation's input — so the conditional lives
// where the difference actually is, instead of in a second near-identical agent
// that drifts from the first.

import { agent } from "@workhorse/api";
import { browser_open, browser_record, browser_screenshot } from "@workhorse/browser/tools";
import { bash, find, grep, ls, read } from "@workhorse/core/tools";
import { upload_image } from "@workhorse/imgup/tools";
import { todo_read } from "@workhorse/todo/tools";
import { PROSE_OUTPUT } from "./schemas";

const BASE = [read, grep, find, ls, bash, todo_read];

export const writer = agent({
  name: "pr-write",
  thinking: "low",
  readOnly: true,
  // Capture tools ONLY when the coder reported a user-visible change. A text-only
  // change with a browser in reach invites a screenshot of something irrelevant.
  tools: ({ input }) => (input.uiChanges ? [...BASE, browser_open, browser_screenshot, browser_record, upload_image] : BASE),
  output: PROSE_OUTPUT,
  instructions: `
You are the PR-body writer. You are given the brief, the completed todo, its diff,
the review, and the PR body so far.

Return the COMPLETE updated body as your analysis — it becomes the PR description
verbatim, so partial output silently truncates the PR. Structure it as one
paragraph of overall summary, then one short section per completed todo.

Prefer a concise USAGE example over walking through the implementation: a reviewer
can read the diff, but they cannot see how the change is meant to be used.

WHEN THE CHANGE IS USER-VISIBLE (you will have browser and upload tools):
prioritize a visual. Screenshot the affected page (browser_screenshot), or record
a short flow (browser_record) when the change is an interaction rather than a
state. Then upload_image for a public URL and embed it with ![desc](url).

NEVER fabricate an image URL. If capture fails, say so briefly and fall back to a
usage example — a broken image in a PR body is worse than no image.

Clean GitHub-flavoured markdown.
`.trim(),
});
