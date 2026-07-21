// GitHub source plugin: verifies webhook signatures and normalizes PR
// feedback (reviews, comments, CI failures) into ticket events.
// Mirrors legacy workhorse-plugin-github/monitor semantics (review
// priorities, newly-failed checks) on a push basis instead of polling.

import type { Env, ExternalEvent, WorkhorsePlugin } from "@workhorse/api";

async function hmacValid(secret: string, rawBody: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected =
    "sha256=" +
    [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time-ish compare.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Resolve a PR to its ticket via the mapping written at delivery. */
async function ticketForPR(env: Env, repoFull: string, prNumber: number): Promise<string | null> {
  return env.TICKETS.get(`pr:${repoFull}#${prNumber}`);
}

const webhook = {
  async verify(request: Request, rawBody: string, env: Env): Promise<boolean> {
    const sig = request.headers.get("x-hub-signature-256");
    if (!sig || !env.GITHUB_WEBHOOK_SECRET) return false;
    return hmacValid(env.GITHUB_WEBHOOK_SECRET, rawBody, sig);
  },

  async parse(headers: Headers, payload: unknown, env: Env): Promise<ExternalEvent[]> {
    const event = headers.get("x-github-event") ?? "";
    const p = payload as Record<string, any>;
    const repoFull: string | undefined = p.repository?.full_name;
    if (!repoFull) return [];
    const now = new Date().toISOString();
    const out: ExternalEvent[] = [];

    const push = async (prNumber: number, e: Omit<ExternalEvent, "ticketId" | "receivedAt">) => {
      const ticketId = await ticketForPR(env, repoFull, prNumber);
      if (!ticketId) return;
      // Ignore bot echoes.
      if (e.actor?.endsWith("[bot]")) return;
      out.push({ ...e, ticketId, receivedAt: now });
    };

    if (event === "pull_request_review" && p.action === "submitted") {
      const r = p.review;
      await push(p.pull_request.number, {
        kind: "pr-review",
        summary: `PR review (${r.state}) by ${r.user?.login}: ${(r.body || "(no comment)").slice(0, 500)}`,
        actor: r.user?.login,
        detail: { state: r.state, body: r.body, url: r.html_url },
      });
    } else if (event === "pull_request_review_comment" && p.action === "created") {
      const c = p.comment;
      await push(p.pull_request.number, {
        kind: "pr-comment",
        summary: `Inline comment by ${c.user?.login} on ${c.path}: ${(c.body || "").slice(0, 500)}`,
        actor: c.user?.login,
        detail: { path: c.path, line: c.line, body: c.body, url: c.html_url },
      });
    } else if (event === "issue_comment" && p.action === "created" && p.issue?.pull_request) {
      const c = p.comment;
      // Ignore the agent's own PR replies (posted with the same token as the
      // human's) — without this the reply itself would wake the workflow: loop.
      if ((c.body || "").startsWith("**Workhorse revision")) return [];
      await push(p.issue.number, {
        kind: "pr-comment",
        summary: `PR comment by ${c.user?.login}: ${(c.body || "").slice(0, 500)}`,
        actor: c.user?.login,
        detail: { body: c.body, url: c.html_url },
      });
    } else if (event === "pull_request" && p.action === "closed") {
      // External completion signal — the ONLY path to "done" (or closure).
      await push(p.pull_request.number, {
        kind: p.pull_request.merged ? "pr-merged" : "pr-closed",
        summary: p.pull_request.merged
          ? `PR #${p.pull_request.number} merged by ${p.pull_request.merged_by?.login ?? "unknown"}`
          : `PR #${p.pull_request.number} closed without merging`,
        actor: p.sender?.login,
        detail: { merged: p.pull_request.merged, url: p.pull_request.html_url },
      });
    } else if (event === "check_run" && p.action === "completed" && p.check_run?.conclusion === "failure") {
      for (const pr of p.check_run.pull_requests ?? []) {
        await push(pr.number, {
          kind: "ci-failed",
          summary: `CI check failed: ${p.check_run.name}`,
          actor: undefined,
          detail: { name: p.check_run.name, url: p.check_run.html_url },
        });
      }
    }

    return out;
  },
};

// ---- sandbox read tools: /github/* proxy --------------------------------
//
// The gh_* sandbox tools (extension.ts) call back through this route with
// the SCOPED token; the fleet GITHUB_TOKEN never enters the sandbox. Read
// endpoints only — the system talks to GitHub for writes (branch, PR,
// replies); the agent works in the repo. That separation keeps "the agent
// can never self-complete" true.
const GH_ALLOWED = [
  /^\/repos\/[\w.-]+\/[\w.-]+\/pulls(\/\d+(\/files|\/reviews|\/comments)?)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/issues(\/\d+(\/comments)?)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/commits(\/[\w]+)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/actions\/runs(\/\d+(\/jobs)?)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/actions\/workflows$/,
  /^\/search\/code$/,
  /^\/search\/issues$/,
];

export const githubPlugin: WorkhorsePlugin = {
  id: "github",
  webhook,
  routes: [
    {
      method: "GET",
      path: "/github",
      auth: "scoped",
      async handler(request, env) {
        const url = new URL(request.url);
        const target = url.searchParams.get("path") ?? "";
        const [pathname, query] = target.split("?");
        if (!GH_ALLOWED.some((re) => re.test(pathname))) {
          return Response.json({ error: `path not allowed: ${pathname}` }, { status: 403 });
        }
        const r = await fetch(`https://api.github.com${pathname}${query ? `?${query}` : ""}`, {
          headers: {
            authorization: `Bearer ${env.GITHUB_TOKEN}`,
            accept: "application/vnd.github+json",
            "user-agent": "workhorse",
          },
        });
        const body = await r.text();
        return new Response(body.slice(0, 400_000), {
          status: r.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  ],
};
