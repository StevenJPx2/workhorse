// gh_commits — list recent commits (by path/author) or read one commit's diff summary.
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { gh } from "../api";
import { asEnv, j, repoSlug } from "./_shared";

export default tool({
  name: "gh_commits",
  description: "List recent commits (optionally by path/author) or read one commit's diff summary.",
  input: v.object({ repo: v.optional(v.string()), sha: v.optional(v.string()), path: v.optional(v.string()) }),
  async run({ input, ...ctx }) {
    const e = asEnv(ctx);
    if (input.sha) {
      const d = (await gh(e, `/repos/${repoSlug(ctx, input.repo)}/commits/${input.sha}`)) as {
        commit?: { message?: string; author?: { name?: string; date?: string } };
        files?: Array<{ filename: string; additions: number; deletions: number }>;
      };
      return j({
        message: d.commit?.message, author: d.commit?.author,
        files: (d.files ?? []).map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`),
      });
    }
    const query = input.path ? `?path=${encodeURIComponent(input.path)}&per_page=15` : "?per_page=15";
    const data = (await gh(e, `/repos/${repoSlug(ctx, input.repo)}/commits${query}`)) as Array<{
      sha: string; commit?: { message?: string; author?: { name?: string; date?: string } };
    }>;
    return j(data.map((c) => ({ sha: c.sha.slice(0, 8), msg: c.commit?.message?.split("\n")[0], by: c.commit?.author?.name, at: c.commit?.author?.date })));
  },
});
