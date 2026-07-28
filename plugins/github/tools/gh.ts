// gh — read GitHub's live state through the scoped worker proxy.
//
// One tool for the whole read surface. Everything here is read-only by
// construction (the /github proxy allowlists GET), so unlike aft and browser
// there is no capability line to split on — consolidation is unconditionally
// safe and saves five tool descriptions in every stage prompt.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { gh as api } from "../api";
import { asEnv, j, repoSlug } from "./_shared";

export default tool({
  name: "gh",
  description:
    "Read live GitHub state: pr (details/files/reviews/comments), ci (Actions runs and failed " +
    "steps), issue, commits, search_code. Shows what GitHub ACTUALLY has — real review feedback " +
    "and the real diff — not your local view. Read-only: it cannot merge, close, or comment.",
  docs: `
gh — read-only GitHub reads via the worker's scoped proxy. Repo defaults to the
ticket's repo; pass \`repo: "owner/name"\` to look elsewhere.

ACTIONS

pr — a pull request's live state.
  number  (required) PR number
  part    details (default) | files | reviews | comments
          details  → title, state, merged, mergeable, base/head, body, url
          files    → changed files with patches (truncated per file)
          reviews  → submitted reviews
          comments → review comments
  This is how you read ACTUAL reviewer feedback on a revision run.

ci — GitHub Actions state.
  branch  recent runs for a branch (status + conclusion)
  runId   one run's jobs, with the FAILED STEP NAMES extracted
  Call with branch to find the failing run, then with runId to see what broke.

issue — an issue's title, body, labels, state.
  number    (required)
  comments  true → the comment thread instead of the issue body

commits — recent commits, or one commit's diff summary.
  path  restrict the list to commits touching a path
  sha   read ONE commit: message, author, and per-file +/- counts

search_code — code search across GitHub.
  query  (required) supports qualifiers: repo:, org:, language:, path:, filename:
  Use for "how do others call this API" or finding a definition inside a
  dependency you don't have locally.

EXAMPLES

  { action: "pr", number: 42 }
  { action: "pr", number: 42, part: "reviews" }
  { action: "ci", branch: "fix/login" }
  { action: "ci", runId: 1234567 }
  { action: "issue", number: 17, comments: true }
  { action: "commits", path: "src/auth.ts" }
  { action: "commits", sha: "abc1234" }
  { action: "search_code", query: "createFlueContext language:typescript" }

Results are JSON, truncated to stay prompt-sized. Nothing here can mutate the
repository — the proxy permits GET only.
`,
  input: v.object({
    action: v.picklist(["pr", "ci", "issue", "commits", "search_code"]),
    repo: v.optional(v.string()),
    // pr / issue
    number: v.optional(v.number()),
    part: v.optional(v.picklist(["details", "files", "reviews", "comments"])),
    comments: v.optional(v.boolean()),
    // ci
    branch: v.optional(v.string()),
    runId: v.optional(v.number()),
    // commits
    sha: v.optional(v.string()),
    path: v.optional(v.string()),
    // search_code
    query: v.optional(v.string()),
  }),
  async run({ input, ...ctx }) {
    const e = asEnv(ctx as never);
    const slug = () => repoSlug(ctx as never, input.repo);

    switch (input.action) {
      case "pr": {
        if (input.number === undefined) return 'gh: action "pr" needs a number.';
        const sub =
          input.part === "files"
            ? "/files"
            : input.part === "reviews"
              ? "/reviews"
              : input.part === "comments"
                ? "/comments"
                : "";
        const data = await api(e, `/repos/${slug()}/pulls/${input.number}${sub}`);

        if (input.part === "files") {
          return j(
            (
              data as Array<{
                filename: string;
                status: string;
                additions: number;
                deletions: number;
                patch?: string;
              }>
            ).map((f) => ({
              filename: f.filename,
              status: f.status,
              "+/-": `${f.additions}/${f.deletions}`,
              patch: f.patch?.slice(0, 1500),
            })),
          );
        }
        if (!input.part || input.part === "details") {
          const d = data as Record<string, unknown>;
          return j({
            title: d.title,
            state: d.state,
            merged: d.merged,
            mergeable: d.mergeable,
            base: (d.base as { ref?: string })?.ref,
            head: (d.head as { ref?: string })?.ref,
            body: String(d.body ?? "").slice(0, 2000),
            url: d.html_url,
          });
        }
        return j(data);
      }

      case "ci": {
        if (input.runId) {
          const data = (await api(e, `/repos/${slug()}/actions/runs/${input.runId}/jobs`)) as {
            jobs?: Array<{
              name: string;
              status: string;
              conclusion: string;
              steps?: Array<{ name: string; conclusion: string }>;
            }>;
          };
          return j(
            (data.jobs ?? []).map((jb) => ({
              name: jb.name,
              conclusion: jb.conclusion ?? jb.status,
              failedSteps: (jb.steps ?? []).filter((s) => s.conclusion === "failure").map((s) => s.name),
            })),
          );
        }
        const query = input.branch ? `?branch=${encodeURIComponent(input.branch)}&per_page=10` : "?per_page=10";
        const data = (await api(e, `/repos/${slug()}/actions/runs${query}`)) as {
          workflow_runs?: Array<{
            id: number;
            name: string;
            head_branch: string;
            status: string;
            conclusion: string;
            html_url: string;
          }>;
        };
        return j(
          (data.workflow_runs ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            branch: r.head_branch,
            conclusion: r.conclusion ?? r.status,
            url: r.html_url,
          })),
        );
      }

      case "issue": {
        if (input.number === undefined) return 'gh: action "issue" needs a number.';
        const data = await api(
          e,
          `/repos/${slug()}/issues/${input.number}${input.comments ? "/comments" : ""}`,
        );
        if (input.comments) {
          return j(
            (data as Array<{ user?: { login?: string }; body?: string; created_at: string }>).map((c) => ({
              by: c.user?.login,
              at: c.created_at,
              body: String(c.body ?? "").slice(0, 1200),
            })),
          );
        }
        const d = data as Record<string, unknown>;
        return j({
          title: d.title,
          state: d.state,
          labels: (d.labels as Array<{ name?: string }>)?.map((l) => l.name),
          body: String(d.body ?? "").slice(0, 3000),
          url: d.html_url,
        });
      }

      case "commits": {
        if (input.sha) {
          const d = (await api(e, `/repos/${slug()}/commits/${input.sha}`)) as {
            commit?: { message?: string; author?: { name?: string; date?: string } };
            files?: Array<{ filename: string; additions: number; deletions: number }>;
          };
          return j({
            message: d.commit?.message,
            author: d.commit?.author,
            files: (d.files ?? []).map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`),
          });
        }
        const query = input.path ? `?path=${encodeURIComponent(input.path)}&per_page=15` : "?per_page=15";
        const data = (await api(e, `/repos/${slug()}/commits${query}`)) as Array<{
          sha: string;
          commit?: { message?: string; author?: { name?: string; date?: string } };
        }>;
        return j(
          data.map((c) => ({
            sha: c.sha.slice(0, 8),
            msg: c.commit?.message?.split("\n")[0],
            by: c.commit?.author?.name,
            at: c.commit?.author?.date,
          })),
        );
      }

      case "search_code": {
        if (!input.query) return 'gh: action "search_code" needs a query.';
        const data = (await api(e, `/search/code?q=${encodeURIComponent(input.query)}&per_page=10`)) as {
          total_count?: number;
          items?: Array<{ repository?: { full_name?: string }; path?: string; html_url?: string }>;
        };
        return j({
          total: data.total_count,
          items: (data.items ?? []).map((i) => ({
            repo: i.repository?.full_name,
            path: i.path,
            url: i.html_url,
          })),
        });
      }
    }
  },
});
