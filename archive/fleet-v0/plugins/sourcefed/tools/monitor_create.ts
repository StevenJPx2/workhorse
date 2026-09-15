// SourceFed monitor verbs — RPC to the host daemon (M3b). The daemon runs
// on the operator's machine (systemd) and owns the polls; these tools tell it
// what to watch. The daemon pushes what it sees back to POST /webhooks/sourcefed.
//
// Contract (see plugins/sourcefed/README.md):
//   POST   {daemon}/monitors              create { kind, target, intervalSec?, note? }
//   GET    {daemon}/monitors              list
//   GET    {daemon}/monitors/{id}         status
//   POST   {daemon}/monitors/{id}/stop    pause
//   POST   {daemon}/monitors/{id}/start   resume
// Auth: X-SourceFed-Secret (same shared secret as the webhook).

import { tool, type Env } from "@workhorse/api";
import * as v from "valibot";

/** The daemon's base URL + secret, or null when not configured. */
export function daemonTarget(env: Env): { base: string; secret: string } | null {
  if (!env) return null;
  const base = (env as { SOURCEFED_DAEMON_URL?: string }).SOURCEFED_DAEMON_URL;
  const secret = (env as { SOURCEFED_WEBHOOK_SECRET?: string }).SOURCEFED_WEBHOOK_SECRET;
  if (!base || !secret) return null;
  return { base: base.replace(/\/$/, ""), secret };
}

/** Call the daemon; returns { ok, text } — never throws. */
export async function daemonCall(
  target: { base: string; secret: string },
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch(`${target.base}${path}`, {
      method,
      headers: {
        "x-sourcefed-secret": target.secret,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = (await res.text()).slice(0, 4000);
    return { ok: res.ok, text };
  } catch (e) {
    return { ok: false, text: `daemon unreachable: ${String((e as Error)?.message ?? e).slice(0, 300)}` };
  }
}

export default tool({
  name: "sourcefed_monitor_create",
  description:
    "Ask the host SourceFed daemon to watch something and push events back to the fleet: a GitHub PR's " +
    "state, a Jira issue's comments, or a repo's CI status. When the watched thing changes, the daemon " +
    "wakes the ticket (new feedback → revision run) or fires a monitor trigger. Use it after opening a " +
    "PR so the fleet keeps watching it.",
  docs: `
sourcefed_monitor_create — register a watch on the host daemon.

The daemon polls on the operator's machine (never in a sandbox) and pushes
frames to POST /webhooks/sourcefed. Ticket frames wake parked runs; monitor
frames fire registered triggers.

ARGUMENTS
  kind        github-pr | github-ci | jira-issue | repo-ci | web
  target      what to watch — "owner/repo#42" (github-pr), "PROJ-123"
              (jira-issue), "owner/repo" (repo-ci), a URL (web)
  intervalSec poll interval (default 300, min 30)
  note        free-form reminder of why this monitor exists

EXAMPLES
  { kind: "github-pr", target: "stevenjohn/home_temp#1", note: "wait for review" }
  { kind: "jira-issue", target: "PROJ-123" }
`,
  input: v.object({
    kind: v.picklist(["github-pr", "github-ci", "jira-issue", "repo-ci", "web"]),
    target: v.string(),
    intervalSec: v.optional(v.number()),
    note: v.optional(v.string()),
  }),
  surfaces: ["stage", "chat"],
  async run({ input, env }: { input: { kind: string; target: string; intervalSec?: number; note?: string }; env: Env }) {
    const target = daemonTarget(env);
    if (!target) return "sourcefed_monitor_create: the SourceFed daemon is not configured (SOURCEFED_DAEMON_URL missing) — monitors live on the host, not in the sandbox.";
    const r = await daemonCall(target, "POST", "/monitors", {
      kind: input.kind,
      target: input.target,
      ...(input.intervalSec ? { intervalSec: input.intervalSec } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    return r.ok ? r.text : `sourcefed_monitor_create failed (${r.text})`;
  },
});
