// gh_ci — read GitHub Actions state (recent runs for a branch, or a run's jobs).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { gh } from "../api";
import { asEnv, j, repoSlug } from "./_shared";

export default tool({
  name: "gh_ci",
  description:
    "Read GitHub Actions state: recent workflow runs for a branch (status + conclusion), or a " +
    "run's jobs with per-step results — find WHAT failed and WHERE without guessing.",
  input: v.object({ repo: v.optional(v.string()), branch: v.optional(v.string()), runId: v.optional(v.number()) }),
  async run({ input, ...ctx }) {
    const e = asEnv(ctx);
    if (input.runId) {
      const data = (await gh(e, `/repos/${repoSlug(ctx, input.repo)}/actions/runs/${input.runId}/jobs`)) as {
        jobs?: Array<{ name: string; status: string; conclusion: string; steps?: Array<{ name: string; conclusion: string }> }>;
      };
      return j(
        (data.jobs ?? []).map((jb) => ({
          name: jb.name, conclusion: jb.conclusion ?? jb.status,
          failedSteps: (jb.steps ?? []).filter((s) => s.conclusion === "failure").map((s) => s.name),
        })),
      );
    }
    const query = input.branch ? `?branch=${encodeURIComponent(input.branch)}&per_page=10` : "?per_page=10";
    const data = (await gh(e, `/repos/${repoSlug(ctx, input.repo)}/actions/runs${query}`)) as {
      workflow_runs?: Array<{ id: number; name: string; head_branch: string; status: string; conclusion: string; html_url: string }>;
    };
    return j(
      (data.workflow_runs ?? []).map((r) => ({
        id: r.id, name: r.name, branch: r.head_branch, conclusion: r.conclusion ?? r.status, url: r.html_url,
      })),
    );
  },
});
