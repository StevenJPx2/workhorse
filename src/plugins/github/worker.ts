// GitHub source plugin: verifies webhook signatures and normalizes PR
// feedback (reviews, comments, CI failures) into ticket events.
// Mirrors legacy workhorse-plugin-github/monitor semantics (review
// priorities, newly-failed checks) on a push basis instead of polling.

import type { Env } from "../../types";
import type { ExternalEvent, SourcePlugin } from "../types";

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

export const githubPlugin: SourcePlugin = {
  id: "github",

  async verify(request, rawBody, env) {
    const sig = request.headers.get("x-hub-signature-256");
    if (!sig || !env.GITHUB_WEBHOOK_SECRET) return false;
    return hmacValid(env.GITHUB_WEBHOOK_SECRET, rawBody, sig);
  },

  async parse(headers, payload, env) {
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
