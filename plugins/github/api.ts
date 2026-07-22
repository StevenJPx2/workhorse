// Shared GitHub read surface — the allowlist + fetch used by BOTH the
// /github proxy route (stateless/legacy callers) and the gh_* stage tools
// (flue engine, worker-side). Read endpoints only: the system talks to
// GitHub for writes (branch, PR, replies); the agent works in the repo.
// That separation keeps "the agent can never self-complete" true.

import type { Env } from "@workhorse/api";

export const GH_ALLOWED = [
  /^\/repos\/[\w.-]+\/[\w.-]+\/pulls(\/\d+(\/files|\/reviews|\/comments)?)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/issues(\/\d+(\/comments)?)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/commits(\/[\w]+)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/actions\/runs(\/\d+(\/jobs)?)?$/,
  /^\/repos\/[\w.-]+\/[\w.-]+\/actions\/workflows$/,
  /^\/search\/code$/,
  /^\/search\/issues$/,
];

/** Raw GitHub GET (allowlist-guarded). Returns {status, body} text. */
export async function ghProxy(env: Env, target: string): Promise<{ status: number; body: string }> {
  const [pathname, query] = target.split("?");
  if (!GH_ALLOWED.some((re) => re.test(pathname))) {
    return { status: 403, body: JSON.stringify({ error: `path not allowed: ${pathname}` }) };
  }
  const r = await fetch(`https://api.github.com${pathname}${query ? `?${query}` : ""}`, {
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "workhorse",
    },
  });
  return { status: r.status, body: (await r.text()).slice(0, 400_000) };
}

/** Allowlist-guarded GitHub GET returning parsed JSON (throws on failure). */
export async function gh(env: Env, path: string): Promise<unknown> {
  const { status, body } = await ghProxy(env, path);
  if (status >= 400) throw new Error(`github ${status}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}
