// gh_issue — read an issue (or its comments): title, body, labels, state.
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { gh } from "../api";
import { asEnv, j, repoSlug } from "./_shared";

export default tool({
  name: "gh_issue",
  description: "Read an issue (or its comments): title, body, labels, state.",
  input: v.object({ number: v.number(), repo: v.optional(v.string()), comments: v.optional(v.boolean()) }),
  async run({ input, ...ctx }) {
    const e = asEnv(ctx);
    const data = await gh(e, `/repos/${repoSlug(ctx, input.repo)}/issues/${input.number}${input.comments ? "/comments" : ""}`);
    if (input.comments) {
      return j(
        (data as Array<{ user?: { login?: string }; body?: string; created_at: string }>).map((c) => ({
          by: c.user?.login, at: c.created_at, body: String(c.body ?? "").slice(0, 1200),
        })),
      );
    }
    const d = data as Record<string, unknown>;
    return j({
      title: d.title, state: d.state, labels: (d.labels as Array<{ name?: string }>)?.map((l) => l.name),
      body: String(d.body ?? "").slice(0, 3000), url: d.html_url,
    });
  },
});
