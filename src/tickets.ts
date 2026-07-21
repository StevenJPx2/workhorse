// Ticket filing — shared by the HTTP API and source plugins (Slack).

import type { Env, TicketParams, TicketRecord } from "./types";

export type FileTicketResult =
  | { ok: true; ticket: TicketRecord }
  | { ok: false; error: string; status: number };

/** Create the registry record + durable workflow instance for a new ticket. */
export async function fileTicket(
  env: Env,
  body: Partial<TicketParams>,
): Promise<FileTicketResult> {
  if (!body.repo || !body.prompt) {
    return { ok: false, error: "repo, prompt required", status: 400 };
  }
  // Accept bare "owner/name" slugs as well as full git URLs.
  if (/^[\w.-]+\/[\w.-]+$/.test(body.repo)) {
    body.repo = `https://github.com/${body.repo}.git`;
  }
  if (!body.accessToken) {
    // Fall back to the custodian-pushed token.
    const stored = await env.TICKETS.get("auth:access");
    const parsed = stored ? (JSON.parse(stored) as { access: string; expires: number }) : null;
    if (!parsed || parsed.expires - Date.now() < 10 * 60 * 1000) {
      return { ok: false, error: "no fresh access token available (custodian push stale?)", status: 503 };
    }
    body.accessToken = parsed.access;
  }
  const id = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const rec: TicketRecord = {
    id,
    title: body.title ?? body.prompt.slice(0, 60),
    repo: body.repo,
    prompt: body.prompt,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    workflow: body.workflow,
    wfInstance: id,
  };
  await env.TICKETS.put(id, JSON.stringify(rec));
  await env.TICKET_WF.create({
    id,
    params: { ...body, id, title: rec.title } as TicketParams,
  });
  return { ok: true, ticket: rec };
}
