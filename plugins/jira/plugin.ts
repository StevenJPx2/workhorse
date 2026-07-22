// Jira source plugin — the first true INTAKE source: GitHub reacts to PRs
// Workhorse opened; Jira ORIGINATES work.
//
// Inbound (POST /webhooks/jira, Atlassian webhook):
//   - issue assigned to the Workhorse account or labeled `workhorse` →
//     core.fileTicket with the issue summary/description as the prompt.
//     Repo resolved from the KV project→repo map (`jira-project:<KEY>`) or
//     a `repo: owner/name` line convention in the issue description.
//     Mapping `jira:<issueKey>` ↔ ticket id stored both ways.
//   - new comment on a mapped issue → two-path model: live run → steer;
//     parked → revision event + wake (same as PR/Slack feedback).
//   - issue transitioned to Done/Closed → accepted external completion
//     signal (like PR merge); the agent still can't self-complete.
//
// Outbound (onStatusChange hook): transition the issue along a status map
// and comment the PR link when it goes up. Best-effort; silent when Jira
// isn't configured.
//
// Auth: webhook verified via a shared-secret query param (Atlassian cloud
// webhooks can't sign; register the webhook URL as
// /webhooks/jira?secret=<JIRA_WEBHOOK_SECRET>). Outbound uses
// JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN basic auth.

import type { Core, Env, TicketRecord, WorkhorsePlugin } from "@workhorse/api";

// ---------- outbound Jira REST ----------

function jiraConfigured(env: Env): boolean {
  return !!(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN);
}

function authHeader(env: Env): string {
  return "Basic " + btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);
}

async function jiraApi(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${env.JIRA_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: authHeader(env),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Comment on an issue (ADF body). Best-effort. */
async function comment(env: Env, issueKey: string, text: string): Promise<void> {
  try {
    if (!jiraConfigured(env)) return;
    await jiraApi(env, "POST", `/rest/api/3/issue/${issueKey}/comment`, {
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    });
  } catch {
    /* notifications never fail the caller */
  }
}

/** Transition an issue to the first available transition whose name matches. */
async function transitionTo(env: Env, issueKey: string, names: string[]): Promise<void> {
  try {
    if (!jiraConfigured(env)) return;
    const r = await jiraApi(env, "GET", `/rest/api/3/issue/${issueKey}/transitions`);
    if (!r.ok) return;
    const { transitions } = (await r.json()) as {
      transitions: Array<{ id: string; name: string }>;
    };
    const want = names.map((n) => n.toLowerCase());
    const hit = transitions.find((t) => want.includes(t.name.toLowerCase()));
    if (!hit) return;
    await jiraApi(env, "POST", `/rest/api/3/issue/${issueKey}/transitions`, {
      transition: { id: hit.id },
    });
  } catch {
    /* best-effort */
  }
}

// ---------- inbound parsing ----------

/** Extract plain text from an Atlassian Document Format tree. */
function adfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  const parts = (n.content ?? []).map(adfText);
  const joined = parts.join("");
  // Paragraph-level nodes get a newline so lists/paragraphs stay readable.
  return ["paragraph", "heading", "listItem", "codeBlock"].includes(n.type ?? "")
    ? joined + "\n"
    : joined;
}

/** Resolve the target repo for a Jira issue. */
async function resolveRepo(
  env: Env,
  projectKey: string,
  description: string,
): Promise<string | null> {
  // 1) `repo: owner/name` (or full URL) line convention in the description.
  const m = description.match(/^\s*repo:\s*(\S+)\s*$/im);
  if (m) return m[1];
  // 2) per-project map in KV.
  return env.TICKETS.get(`jira-project:${projectKey}`);
}

function isWorkhorseIntake(env: Env, issue: JiraIssue): boolean {
  const labels: string[] = issue.fields?.labels ?? [];
  if (labels.some((l) => l.toLowerCase() === "workhorse")) return true;
  const assignee = issue.fields?.assignee;
  const marker = (env.JIRA_AGENT_ACCOUNT ?? "").toLowerCase();
  if (!marker || !assignee) return false;
  return (
    (assignee.accountId ?? "").toLowerCase() === marker ||
    (assignee.emailAddress ?? "").toLowerCase() === marker ||
    (assignee.displayName ?? "").toLowerCase() === marker
  );
}

interface JiraIssue {
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
    labels?: string[];
    status?: { name?: string };
    project?: { key?: string };
    assignee?: { accountId?: string; emailAddress?: string; displayName?: string } | null;
  };
}

async function fileFromIssue(env: Env, core: Core, issue: JiraIssue): Promise<void> {
  // Dedupe: already mapped → not an intake.
  if (await env.TICKETS.get(`jira:${issue.key}`)) return;
  const summary = issue.fields?.summary ?? issue.key;
  const description =
    typeof issue.fields?.description === "string"
      ? issue.fields.description
      : adfText(issue.fields?.description).trim();
  const repo = await resolveRepo(env, issue.fields?.project?.key ?? "", description);
  if (!repo) {
    await comment(
      env,
      issue.key,
      `Workhorse can't file this ticket: no repo configured for project ${issue.fields?.project?.key}. ` +
        `Add a "repo: owner/name" line to the description or register the project mapping.`,
    );
    return;
  }
  const prompt = [
    `Jira issue ${issue.key}: ${summary}`,
    "",
    description || "(no description)",
  ].join("\n");
  const r = await core.fileTicket({ repo, prompt, title: `${issue.key}: ${summary}`.slice(0, 80) });
  if (!r.ok) {
    await comment(env, issue.key, `Workhorse intake failed: ${r.error}`);
    return;
  }
  await env.TICKETS.put(`jira:${issue.key}`, r.ticket.id);
  await env.TICKETS.put(`jira-key:${r.ticket.id}`, issue.key);
  await comment(env, issue.key, `Workhorse picked this up as ticket ${r.ticket.id}. I'll post the PR here when it's ready.`);
}

async function processEvent(env: Env, core: Core, payload: JiraWebhookPayload): Promise<void> {
  const issue = payload.issue;
  if (!issue?.key) return;
  const mapped = await env.TICKETS.get(`jira:${issue.key}`);

  // --- comments on a mapped issue: steer (live) or revise (parked) ---
  if (payload.webhookEvent === "comment_created" && mapped) {
    const author = payload.comment?.author;
    const marker = (env.JIRA_AGENT_ACCOUNT ?? "").toLowerCase();
    // Ignore the bot's own comments (they'd loop the workflow).
    if (marker && (author?.accountId ?? "").toLowerCase() === marker) return;
    const text = adfText(payload.comment?.body).trim();
    if (!text || text.startsWith("Workhorse")) return;
    // "trigger <name> <input…>" comments fire a registered trigger
    // (the jira-mention trigger source).
    const trig = text.match(/^trigger\s+([a-z][a-z0-9-]+)\s*([\s\S]*)$/i);
    if (trig) {
      const fired = await core.fireTrigger(trig[1].toLowerCase(), {
        input: trig[2].trim() || text,
        issueKey: issue.key,
      });
      await comment(
        env,
        issue.key,
        fired.ok
          ? `Workhorse: trigger "${trig[1]}" fired → ticket ${fired.ticket.id}.`
          : `Workhorse: trigger "${trig[1]}" failed: ${fired.error}`,
      );
      return;
    }
    const rec = await core.getTicket(mapped);
    if (!rec) return;
    const active = ["queued", "planning", "implementing", "ready-for-review"];
    if (active.includes(rec.status)) {
      await core.appendSteer(mapped, text.slice(0, 4000));
      await comment(env, issue.key, "Steering the live run with your comment.");
    } else if (rec.status === "in-review") {
      await core.appendEvents([
        {
          ticketId: mapped,
          kind: "jira-comment",
          summary: `Jira comment by ${author?.displayName ?? "someone"}: ${text.slice(0, 500)}`,
          actor: author?.displayName,
          detail: { issueKey: issue.key, body: text.slice(0, 2000) },
          receivedAt: new Date().toISOString(),
        },
      ]);
      await core.wakeTicket(mapped);
      await comment(env, issue.key, "Got it — waking the agent for a revision.");
    }
    return;
  }

  // --- issue transitions on a mapped issue: Done/Closed = external completion ---
  if (payload.webhookEvent === "jira:issue_updated" && mapped) {
    const status = (issue.fields?.status?.name ?? "").toLowerCase();
    if (["done", "closed", "resolved"].includes(status)) {
      const rec = await core.getTicket(mapped);
      if (rec && rec.status !== "done" && rec.status !== "terminated") {
        // Plugin-provided transition: Jira's Done is an accepted external
        // completion signal (like PR merge, like the UI's Accept).
        await core.signalTransition(
          mapped,
          "jira-done",
          `Jira issue ${issue.key} transitioned to ${issue.fields?.status?.name}`,
        );
      }
      return;
    }
    // An update may also be a fresh assignment/labeling → intake check.
    if (isWorkhorseIntake(env, issue)) await fileFromIssue(env, core, issue);
    return;
  }

  // --- new/updated issues: intake when assigned to us or labeled ---
  if (payload.webhookEvent === "jira:issue_created" && isWorkhorseIntake(env, issue)) {
    await fileFromIssue(env, core, issue);
  }
}

interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: JiraIssue;
  comment?: { author?: { accountId?: string; displayName?: string }; body?: unknown };
}

// ---------- plugin ----------

export const jiraPlugin: WorkhorsePlugin = {
  id: "jira",

  triggers: [
    {
      kind: "jira-mention",
      describe: 'a comment starting with "trigger <name>" on any Workhorse-mapped issue',
    },
  ],

  attachments: [
    {
      kind: "jira",
      label: "Jira issue",
      icon: "i-lucide-square-kanban",
      match(input) {
        const s = input.trim();
        // PROJ-123 or a browse URL.
        const url = s.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/);
        if (url) return url[1];
        return /^[A-Z][A-Z0-9]+-\d+$/.test(s) ? s : null;
      },
      async resolve(env, _core, ref) {
        if (!jiraConfigured(env)) throw new Error("Jira not configured");
        const r = await jiraApi(env, "GET", `/rest/api/3/issue/${ref}?fields=summary,description,status,labels,comment`);
        if (!r.ok) throw new Error(`Jira fetch failed: HTTP ${r.status}`);
        const issue = (await r.json()) as JiraIssue & {
          fields?: { comment?: { comments?: Array<{ author?: { displayName?: string }; body?: unknown }> } };
        };
        const desc = adfText(issue.fields?.description).trim();
        const comments = (issue.fields?.comment?.comments ?? [])
          .slice(-5)
          .map((c) => `- ${c.author?.displayName ?? "?"}: ${adfText(c.body).trim().slice(0, 400)}`)
          .join("\n");
        return {
          title: `${ref}: ${issue.fields?.summary ?? ""}`,
          summary: `Jira · ${issue.fields?.status?.name ?? "?"}`,
          content: [
            `Jira issue ${ref} — ${issue.fields?.summary ?? ""} (status: ${issue.fields?.status?.name ?? "?"})`,
            desc ? `\n${desc.slice(0, 3000)}` : "",
            comments ? `\nRecent comments:\n${comments}` : "",
          ].join("\n"),
          url: `${env.JIRA_BASE_URL}/browse/${ref}`,
        };
      },
    },
  ],

  webhook: {
    // Atlassian cloud webhooks can't sign requests; authenticity = a
    // shared-secret query param on the registered URL, constant-time compared.
    async verify(request, _rawBody, env) {
      if (!env.JIRA_WEBHOOK_SECRET) return false;
      const got = new URL(request.url).searchParams.get("secret") ?? "";
      if (got.length !== env.JIRA_WEBHOOK_SECRET.length) return false;
      let diff = 0;
      for (let i = 0; i < got.length; i++) {
        diff |= got.charCodeAt(i) ^ env.JIRA_WEBHOOK_SECRET.charCodeAt(i);
      }
      return diff === 0;
    },

    // Full override: intake + steering need Core (fileTicket/appendSteer),
    // and Jira retries on slow acks — ack fast, process async.
    async handle(_request, payload, env, ctx, core) {
      ctx.waitUntil(processEvent(env, core, payload as JiraWebhookPayload));
      return Response.json({ ok: true });
    },
  },

  hooks: {
    // Mirror ticket lifecycle onto the Jira issue.
    async onStatusChange(env, _core, { ticketId, to, record }) {
      const issueKey = await env.TICKETS.get(`jira-key:${ticketId}`);
      if (!issueKey) return;
      switch (to) {
        case "implementing":
          await transitionTo(env, issueKey, ["In Progress", "Start Progress"]);
          break;
        case "in-review":
          await transitionTo(env, issueKey, ["In Review", "Review"]);
          if (record.prUrl) {
            await comment(env, issueKey, `Workhorse PR is up: ${record.prUrl} — review/merge there; comments here steer revisions.`);
          }
          break;
        case "done":
          await transitionTo(env, issueKey, ["Done", "Close", "Closed", "Resolve"]);
          await comment(env, issueKey, "Workhorse: PR merged — done.");
          break;
        case "errored":
        case "terminated":
          await comment(env, issueKey, `Workhorse ${to}: ${record.error ?? "unknown"}`);
          break;
      }
    },
  },
};
