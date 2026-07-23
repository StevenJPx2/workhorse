// gh_pr — read a pull request's live state (details / files / reviews / comments).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { gh } from "../api";
import { asEnv, j, repoSlug } from "./_shared";

export default tool({
  name: "gh_pr",
  description:
    "Read a pull request's live state: details (title, body, mergeability), changed files with " +
    "patches, and submitted reviews/comments. See actual review feedback and the real diff " +
    "GitHub has — not just your local view.",
  input: v.object({
    number: v.number(),
    repo: v.optional(v.string()),
    part: v.optional(v.picklist(["details", "files", "reviews", "comments"])),
  }),
  async run({ input, ...ctx }) {
    const e = asEnv(ctx);
    const sub =
      input.part === "files" ? "/files" : input.part === "reviews" ? "/reviews" : input.part === "comments" ? "/comments" : "";
    const data = await gh(e, `/repos/${repoSlug(ctx, input.repo)}/pulls/${input.number}${sub}`);
    if (input.part === "files") {
      return j(
        (data as Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>).map(
          (f) => ({ filename: f.filename, status: f.status, "+/-": `${f.additions}/${f.deletions}`, patch: f.patch?.slice(0, 1500) }),
        ),
      );
    }
    if (!input.part || input.part === "details") {
      const d = data as Record<string, unknown>;
      return j({
        title: d.title, state: d.state, merged: d.merged, mergeable: d.mergeable,
        base: (d.base as { ref?: string })?.ref, head: (d.head as { ref?: string })?.ref,
        body: String(d.body ?? "").slice(0, 2000), url: d.html_url,
      });
    }
    return j(data);
  },
});
