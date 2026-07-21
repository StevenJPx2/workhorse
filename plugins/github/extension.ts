// Pi extension: read-only GitHub tools (sandbox half).
//
// Live GitHub state for agents and fleet chat: PR details/files/reviews,
// CI runs + failing jobs, issues, code search, commits. Calls ride the
// worker's /github proxy with the scoped token — the fleet GITHUB_TOKEN
// never enters the sandbox. Read-only by construction (the proxy
// allowlists GET endpoints); writes stay with the system.
//
// Gating: custom tools — a stage must name them in tools[] with a
// "read-only" classification. Off by default.

import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

function config(): { url: string; token: string } {
  let url = process.env.WORKHORSE_BROWSER_URL ?? "";
  let token = process.env.WORKHORSE_BROWSER_TOKEN ?? "";
  if (!url || !token) {
    try {
      const f = JSON.parse(readFileSync("/root/.workhorse-browser.json", "utf8"));
      url ||= f.url ?? "";
      token ||= f.token ?? "";
    } catch {
      /* fall through */
    }
  }
  return { url: url.replace(/\/$/, ""), token };
}

async function gh(path: string): Promise<unknown> {
  const { url, token } = config();
  if (!url || !token) throw new Error("github tools not configured (no callback config)");
  const r = await fetch(`${url}/github?path=${encodeURIComponent(path)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`github proxy HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Repo slug from the ticket context or an explicit owner/repo argument. */
function repoSlug(explicit?: string): string {
  if (explicit) return explicit;
  try {
    const t = JSON.parse(readFileSync("/root/.workhorse-ticket.json", "utf8"));
    if (t.repo) return t.repo;
  } catch {
    /* fall through */
  }
  throw new Error("no repo in ticket context — pass repo: owner/name");
}

const j = (v: unknown) => JSON.stringify(v, null, 1).slice(0, 12_000);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "gh_pr",
    label: "GitHub PR",
    description:
      "Read a pull request's live state: details (title, body, mergeability), changed files " +
      "with patches, and submitted reviews/comments. Use it to see actual review feedback and " +
      "the real diff GitHub has — not just your local view.",
    parameters: Type.Object({
      number: Type.Number({ description: "PR number" }),
      repo: Type.Optional(Type.String({ description: "owner/name (default: ticket repo)" })),
      part: Type.Optional(
        Type.Union([Type.Literal("details"), Type.Literal("files"), Type.Literal("reviews"), Type.Literal("comments")], {
          description: "Which facet (default details)",
        }),
      ),
    }),
    async execute(_id, p) {
      const slug = repoSlug(p.repo);
      const sub = p.part === "files" ? "/files" : p.part === "reviews" ? "/reviews" : p.part === "comments" ? "/comments" : "";
      const data = await gh(`/repos/${slug}/pulls/${p.number}${sub}`);
      if (p.part === "files") {
        const files = (data as Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>).map(
          (f) => ({ filename: f.filename, status: f.status, "+/-": `${f.additions}/${f.deletions}`, patch: f.patch?.slice(0, 1500) }),
        );
        return textResult(j(files));
      }
      if (p.part === "details" || !p.part) {
        const d = data as Record<string, unknown>;
        return textResult(
          j({
            title: d.title, state: d.state, merged: d.merged, mergeable: d.mergeable,
            base: (d.base as { ref?: string })?.ref, head: (d.head as { ref?: string })?.ref,
            body: String(d.body ?? "").slice(0, 2000), url: d.html_url,
          }),
        );
      }
      return textResult(j(data));
    },
  });

  pi.registerTool({
    name: "gh_ci",
    label: "GitHub CI",
    description:
      "Read GitHub Actions state: recent workflow runs for a branch (status + conclusion), or " +
      "a run's jobs with per-step results — find WHAT failed and WHERE without guessing.",
    parameters: Type.Object({
      repo: Type.Optional(Type.String({ description: "owner/name (default: ticket repo)" })),
      branch: Type.Optional(Type.String({ description: "Filter runs by branch" })),
      runId: Type.Optional(Type.Number({ description: "Drill into one run's jobs" })),
    }),
    async execute(_id, p) {
      const slug = repoSlug(p.repo);
      if (p.runId) {
        const data = (await gh(`/repos/${slug}/actions/runs/${p.runId}/jobs`)) as {
          jobs?: Array<{ name: string; status: string; conclusion: string; steps?: Array<{ name: string; conclusion: string }> }>;
        };
        const jobs = (data.jobs ?? []).map((jb) => ({
          name: jb.name, conclusion: jb.conclusion ?? jb.status,
          failedSteps: (jb.steps ?? []).filter((s) => s.conclusion === "failure").map((s) => s.name),
        }));
        return textResult(j(jobs));
      }
      const q = p.branch ? `?branch=${encodeURIComponent(p.branch)}&per_page=10` : "?per_page=10";
      const data = (await gh(`/repos/${slug}/actions/runs${q}`)) as {
        workflow_runs?: Array<{ id: number; name: string; head_branch: string; status: string; conclusion: string; html_url: string }>;
      };
      const runs = (data.workflow_runs ?? []).map((r) => ({
        id: r.id, name: r.name, branch: r.head_branch, conclusion: r.conclusion ?? r.status, url: r.html_url,
      }));
      return textResult(j(runs));
    },
  });

  pi.registerTool({
    name: "gh_issue",
    label: "GitHub issue",
    description: "Read an issue (or its comments): title, body, labels, state.",
    parameters: Type.Object({
      number: Type.Number(),
      repo: Type.Optional(Type.String({ description: "owner/name (default: ticket repo)" })),
      comments: Type.Optional(Type.Boolean({ description: "Return the comment thread instead" })),
    }),
    async execute(_id, p) {
      const slug = repoSlug(p.repo);
      const data = await gh(`/repos/${slug}/issues/${p.number}${p.comments ? "/comments" : ""}`);
      if (p.comments) {
        const cs = (data as Array<{ user?: { login?: string }; body?: string; created_at: string }>).map((c) => ({
          by: c.user?.login, at: c.created_at, body: String(c.body ?? "").slice(0, 1200),
        }));
        return textResult(j(cs));
      }
      const d = data as Record<string, unknown>;
      return textResult(
        j({ title: d.title, state: d.state, labels: (d.labels as Array<{ name?: string }>)?.map((l) => l.name), body: String(d.body ?? "").slice(0, 3000), url: d.html_url }),
      );
    },
  });

  pi.registerTool({
    name: "gh_search_code",
    label: "GitHub code search",
    description:
      "Search code across GitHub (qualifiers supported: repo:, org:, language:, path:, filename:). " +
      "Use for 'how do others call this API' or finding definitions in dependencies.",
    parameters: Type.Object({
      query: Type.String({ description: 'e.g. "createGithubTools repo:vercel-labs/github-tools"' }),
    }),
    async execute(_id, p) {
      const data = (await gh(`/search/code?q=${encodeURIComponent(p.query)}&per_page=10`)) as {
        total_count?: number;
        items?: Array<{ repository?: { full_name?: string }; path?: string; html_url?: string }>;
      };
      const items = (data.items ?? []).map((i) => ({ repo: i.repository?.full_name, path: i.path, url: i.html_url }));
      return textResult(j({ total: data.total_count, items }));
    },
  });

  pi.registerTool({
    name: "gh_commits",
    label: "GitHub commits",
    description: "List recent commits (optionally by path/author) or read one commit's diff summary.",
    parameters: Type.Object({
      repo: Type.Optional(Type.String({ description: "owner/name (default: ticket repo)" })),
      sha: Type.Optional(Type.String({ description: "Read one commit" })),
      path: Type.Optional(Type.String({ description: "Filter list by file path" })),
    }),
    async execute(_id, p) {
      const slug = repoSlug(p.repo);
      if (p.sha) {
        const d = (await gh(`/repos/${slug}/commits/${p.sha}`)) as {
          commit?: { message?: string; author?: { name?: string; date?: string } };
          files?: Array<{ filename: string; additions: number; deletions: number }>;
        };
        return textResult(
          j({
            message: d.commit?.message, author: d.commit?.author,
            files: (d.files ?? []).map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`),
          }),
        );
      }
      const q = p.path ? `?path=${encodeURIComponent(p.path)}&per_page=15` : "?per_page=15";
      const data = (await gh(`/repos/${slug}/commits${q}`)) as Array<{
        sha: string; commit?: { message?: string; author?: { name?: string; date?: string } };
      }>;
      return textResult(
        j(data.map((c) => ({ sha: c.sha.slice(0, 8), msg: c.commit?.message?.split("\n")[0], by: c.commit?.author?.name, at: c.commit?.author?.date }))),
      );
    },
  });
}
