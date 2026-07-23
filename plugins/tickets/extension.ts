// Pi extension: Workhorse fleet client.
//
// Gives any Pi session tools to command the Workhorse coding-agent fleet:
//   workhorse_file_ticket   — file a ticket (repo + prompt) → autonomous run → PR
//   workhorse_list_tickets  — fleet overview
//   workhorse_ticket_status — one ticket's record + live workflow status
//   workhorse_ticket_diff   — the persisted patch of a finished ticket
//
// Config resolution (first hit wins):
//   1. env WORKHORSE_URL / WORKHORSE_TOKEN
//   2. ~/.workhorse.json  { "url": "...", "token": "..." }
//
// Tickets are dispatched tokenless: the Worker uses the custodian-pushed
// short-lived access token (the MacBook owns the refresh token).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function config(): { url: string; token: string } {
  let url = process.env.WORKHORSE_URL ?? "";
  let token = process.env.WORKHORSE_TOKEN ?? "";
  if (!url || !token) {
    try {
      const f = JSON.parse(readFileSync(join(homedir(), ".workhorse.json"), "utf8"));
      url ||= f.url ?? "";
      token ||= f.token ?? "";
    } catch {
      /* fall through */
    }
  }
  return { url: url.replace(/\/$/, ""), token };
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const { url, token } = config();
  if (!url || !token) {
    throw new Error(
      "Workhorse not configured: set WORKHORSE_URL/WORKHORSE_TOKEN or create ~/.workhorse.json",
    );
  }
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`workhorse ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "workhorse_file_ticket",
    label: "Workhorse: file ticket",
    description:
      "File a coding ticket with the Workhorse fleet. An autonomous staged agent " +
      "(plan → implement, per-stage tool gating) runs in an isolated cloud sandbox " +
      "and opens a GitHub PR. Use for well-scoped, small-to-medium code changes on " +
      "a GitHub repo. Returns the ticket id to watch with workhorse_ticket_status.",
    parameters: Type.Object({
      repo: Type.String({ description: "GitHub repo URL, e.g. https://github.com/user/repo" }),
      prompt: Type.String({ description: "The task: what to change, constraints, acceptance criteria" }),
      title: Type.Optional(Type.String({ description: "Short ticket title (defaults to prompt head)" })),
      workflow: Type.Optional(
        Type.String({
          description:
            "Which workflow to run (default: coding). Use workhorse_find_workflow first to pick the best fit for the task.",
        }),
      ),
    }),
    async execute(_id, params) {
      const r = (await api("/tickets", {
        method: "POST",
        body: JSON.stringify(params),
      })) as { ticket: { id: string; title: string } };
      return text(
        `Ticket ${r.ticket.id} filed: "${r.ticket.title}". The fleet is on it — check with workhorse_ticket_status.`,
      );
    },
  });

  pi.registerTool({
    name: "workhorse_find_workflow",
    label: "Workhorse: find workflow",
    description:
      "Semantic search over the fleet's available workflows (each a staged pipeline: " +
      "e.g. coding = plan→implement→verify→PR; screenshot-pr = capture a page → PR). " +
      "Use BEFORE filing a ticket to pick the workflow whose shape fits the task, then " +
      "pass its name to workhorse_file_ticket. Returns ranked {name, description, stages}.",
    parameters: Type.Object({
      query: Type.String({ description: "What the task needs, e.g. 'take a screenshot and open a PR'" }),
    }),
    async execute(_id, params) {
      const q = encodeURIComponent(params.query);
      const r = (await api(`/find?corpus=workflows&q=${q}&topK=5`)) as {
        hits: Array<{ id: string; score: number; metadata?: { name?: string; description?: string; stages?: string } }>;
      };
      if (!r.hits?.length) return text("No workflows matched. Default to 'coding'.");
      const lines = r.hits.map((h) => {
        const m = h.metadata ?? {};
        const name = m.name ?? h.id;
        const stages = m.stages ? ` [${m.stages}]` : "";
        return `- ${name} (${h.score.toFixed(2)})${stages}: ${m.description ?? ""}`;
      });
      return text(`Workflows ranked for "${params.query}":\n${lines.join("\n")}`);
    },
  });

  pi.registerTool({
    name: "workhorse_list_tickets",
    label: "Workhorse: list tickets",
    description: "List Workhorse fleet tickets (id, title, status, PR url), newest first.",
    parameters: Type.Object({}),
    async execute() {
      const r = (await api("/tickets")) as {
        tickets: Array<{ id: string; title: string; status: string; prUrl?: string; updatedAt: string }>;
      };
      if (r.tickets.length === 0) return text("No tickets yet.");
      const lines = r.tickets
        .slice(0, 25)
        .map(
          (t) =>
            `${t.id}  [${t.status}]  ${t.title}${t.prUrl ? `  → ${t.prUrl}` : ""}  (${t.updatedAt})`,
        );
      return text(lines.join("\n"));
    },
  });

  pi.registerTool({
    name: "workhorse_ticket_status",
    label: "Workhorse: ticket status",
    description: "Get one Workhorse ticket: record (status, plan, result, PR) + live workflow state.",
    parameters: Type.Object({
      id: Type.String({ description: "Ticket id" }),
    }),
    async execute(_id, params) {
      const r = (await api(`/tickets/${params.id}`)) as {
        ticket: Record<string, unknown>;
        workflow: { status?: string } | null;
      };
      const t = r.ticket;
      const parts = [
        `id: ${t.id}`,
        `title: ${t.title}`,
        `status: ${t.status}  (workflow: ${r.workflow?.status ?? "n/a"})`,
        t.branch ? `branch: ${t.branch}` : null,
        t.prUrl ? `PR: ${t.prUrl}` : null,
        t.error ? `error: ${t.error}` : null,
        t.result ? `\nresult:\n${String(t.result).slice(0, 2000)}` : null,
      ].filter(Boolean);
      return text(parts.join("\n"));
    },
  });

  pi.registerTool({
    name: "workhorse_ticket_diff",
    label: "Workhorse: ticket diff",
    description: "Fetch the persisted git patch of a finished Workhorse ticket.",
    parameters: Type.Object({
      id: Type.String({ description: "Ticket id" }),
    }),
    async execute(_id, params) {
      const diff = (await api(`/tickets/${params.id}/diff`)) as string;
      return text(String(diff).slice(0, 20000));
    },
  });
}
