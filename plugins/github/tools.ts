// Stage tools: read-only GitHub (flue engine).
//
// The flue port of extension.ts. Runs worker-side, so it calls the GitHub
// API directly through the shared allowlist helper (env.GITHUB_TOKEN stays
// worker-side; the read-only allowlist is the guarantee). The repo defaults
// to the ticket's repo from the factory ctx. Read-only by construction —
// writes stay with the system, so "the agent can never self-complete" holds.

import { defineTool } from "@flue/runtime";
import type { Env, PluginToolFactory } from "@workhorse/api";
import * as v from "valibot";
import { gh } from "./api";

const j = (val: unknown) => JSON.stringify(val, null, 1).slice(0, 12_000);

export const githubTools: PluginToolFactory = ({ env, ticket }) => {
  const e = env as Env;
  const slug = (explicit?: string) => {
    if (explicit) return explicit;
    if (ticket.repo) return ticket.repo;
    throw new Error("no repo in ticket context — pass repo: owner/name");
  };
  return [
    defineTool({
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
      async run({ input }) {
        const sub =
          input.part === "files" ? "/files" : input.part === "reviews" ? "/reviews" : input.part === "comments" ? "/comments" : "";
        const data = await gh(e, `/repos/${slug(input.repo)}/pulls/${input.number}${sub}`);
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
    }),
    defineTool({
      name: "gh_ci",
      description:
        "Read GitHub Actions state: recent workflow runs for a branch (status + conclusion), or a " +
        "run's jobs with per-step results — find WHAT failed and WHERE without guessing.",
      input: v.object({ repo: v.optional(v.string()), branch: v.optional(v.string()), runId: v.optional(v.number()) }),
      async run({ input }) {
        if (input.runId) {
          const data = (await gh(e, `/repos/${slug(input.repo)}/actions/runs/${input.runId}/jobs`)) as {
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
        const data = (await gh(e, `/repos/${slug(input.repo)}/actions/runs${query}`)) as {
          workflow_runs?: Array<{ id: number; name: string; head_branch: string; status: string; conclusion: string; html_url: string }>;
        };
        return j(
          (data.workflow_runs ?? []).map((r) => ({
            id: r.id, name: r.name, branch: r.head_branch, conclusion: r.conclusion ?? r.status, url: r.html_url,
          })),
        );
      },
    }),
    defineTool({
      name: "gh_issue",
      description: "Read an issue (or its comments): title, body, labels, state.",
      input: v.object({ number: v.number(), repo: v.optional(v.string()), comments: v.optional(v.boolean()) }),
      async run({ input }) {
        const data = await gh(e, `/repos/${slug(input.repo)}/issues/${input.number}${input.comments ? "/comments" : ""}`);
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
    }),
    defineTool({
      name: "gh_search_code",
      description:
        "Search code across GitHub (qualifiers: repo:, org:, language:, path:, filename:). Use for " +
        "'how do others call this API' or finding definitions in dependencies.",
      input: v.object({ query: v.string() }),
      async run({ input }) {
        const data = (await gh(e, `/search/code?q=${encodeURIComponent(input.query)}&per_page=10`)) as {
          total_count?: number;
          items?: Array<{ repository?: { full_name?: string }; path?: string; html_url?: string }>;
        };
        return j({ total: data.total_count, items: (data.items ?? []).map((i) => ({ repo: i.repository?.full_name, path: i.path, url: i.html_url })) });
      },
    }),
    defineTool({
      name: "gh_commits",
      description: "List recent commits (optionally by path/author) or read one commit's diff summary.",
      input: v.object({ repo: v.optional(v.string()), sha: v.optional(v.string()), path: v.optional(v.string()) }),
      async run({ input }) {
        if (input.sha) {
          const d = (await gh(e, `/repos/${slug(input.repo)}/commits/${input.sha}`)) as {
            commit?: { message?: string; author?: { name?: string; date?: string } };
            files?: Array<{ filename: string; additions: number; deletions: number }>;
          };
          return j({
            message: d.commit?.message, author: d.commit?.author,
            files: (d.files ?? []).map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`),
          });
        }
        const query = input.path ? `?path=${encodeURIComponent(input.path)}&per_page=15` : "?per_page=15";
        const data = (await gh(e, `/repos/${slug(input.repo)}/commits${query}`)) as Array<{
          sha: string; commit?: { message?: string; author?: { name?: string; date?: string } };
        }>;
        return j(data.map((c) => ({ sha: c.sha.slice(0, 8), msg: c.commit?.message?.split("\n")[0], by: c.commit?.author?.name, at: c.commit?.author?.date })));
      },
    }),
  ];
};
