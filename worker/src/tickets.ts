// Ticket filing — shared by the HTTP API and source plugins (Slack).

import type { Env, TicketParams, TicketRecord } from "@workhorse/api";
import { insertTicket } from "./db";
import { parseRefs, recordRefUse } from "./refs";

/**
 * Resolve attachment refs through their plugin providers into a bounded
 * "## Attached context" prompt section. Unresolvable attachments become
 * a visible note instead of failing the dispatch.
 */
export async function resolveAttachments(
  env: Env,
  selfOrigin: string,
  attachments: Array<{ kind: string; ref: string }>,
): Promise<string> {
  const { attachmentProviders, coreFor } = await import("./plugins");
  const providers = attachmentProviders();
  const core = coreFor(env, selfOrigin);
  const parts: string[] = [];
  for (const a of attachments.slice(0, 8)) {
    if (a.kind === "repo") continue; // the repo is cloned, not inlined
    const provider = providers.get(a.kind);
    if (!provider) {
      parts.push(`### ${a.kind}:${a.ref}\n(unknown attachment kind)`);
      continue;
    }
    try {
      const resolved = await provider.resolve(env, core, a.ref);
      parts.push(
        `### ${resolved.title}${resolved.url ? ` (${resolved.url})` : ""}\n\n${resolved.content.slice(0, 4000)}`,
      );
    } catch (err) {
      parts.push(`### ${a.kind}:${a.ref}\n(failed to resolve: ${String(err).slice(0, 150)})`);
    }
  }
  return parts.length ? `## Attached context\n\n${parts.join("\n\n")}` : "";
}

export type FileTicketResult =
  | { ok: true; ticket: TicketRecord }
  | { ok: false; error: string; status: number };

/** Create the registry record + durable workflow instance for a new ticket. */
export async function fileTicket(
  env: Env,
  body: Partial<TicketParams> & { selfOrigin?: string },
): Promise<FileTicketResult> {
  // A repo attachment can stand in for the repo field.
  if (!body.repo && body.attachments) {
    const repoAtt = body.attachments.find((a) => a.kind === "repo");
    if (repoAtt) body.repo = repoAtt.ref;
  }
  if (!body.repo || !body.prompt) {
    return { ok: false, error: "repo, prompt required", status: 400 };
  }
  // Context refs come from the PROMPT itself now (no manual attach step):
  // parse any repo/jira/slack refs the operator typed, record them for
  // frecency, and tell the agent what it can enrich on demand. The agent
  // fetches a ref's content with fetch_context — nothing is pre-resolved,
  // so a big Jira thread doesn't bloat every prompt. Explicit body.attachments
  // (e.g. from a trigger) are merged in and still recorded.
  const parsed = parseRefs(body.prompt);
  const nonRepoRefs = [
    ...parsed.filter((r) => r.kind !== "repo"),
    ...(body.attachments ?? []).filter((a) => a.kind !== "repo").map((a) => ({ kind: a.kind, ref: a.ref, label: a.kind })),
  ];
  const seen = new Set<string>();
  const enrichable = nonRepoRefs.filter((r) => {
    const k = `${r.kind}:${r.ref}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (enrichable.length) {
    const list = enrichable.map((r) => `- ${r.kind}: ${r.ref}`).join("\n");
    body.prompt = `${body.prompt}\n\n## Available context\nYou can enrich this task with fetch_context(kind, ref) for:\n${list}`;
    await recordRefUse(env, enrichable.map((r) => ({ kind: r.kind, ref: r.ref, label: r.label })));
  }
  delete body.selfOrigin;
  // Accept bare "owner/name" slugs as well as full git URLs.
  if (/^[\w.-]+\/[\w.-]+$/.test(body.repo)) {
    body.repo = `https://github.com/${body.repo}.git`;
  }
  if (!body.accessToken) {
    // Fall back to the custodian-pushed token. Refuse only when there is NO
    // token, or its expiry is KNOWN and within 10 min. A zero/absent expiry
    // (custodian pushed without runway info) is treated as usable — the flue
    // runner re-reads auth:access every stage, so mid-run rotation depends on
    // the custodian keeping KV fresh, not on a file-time runway estimate.
    const stored = await env.TICKETS.get("auth:access");
    const parsed = stored ? (JSON.parse(stored) as { access: string; expires: number }) : null;
    if (!parsed?.access) {
      return { ok: false, error: "no access token (custodian has not pushed one)", status: 503 };
    }
    if (parsed.expires > 0 && parsed.expires - Date.now() < 10 * 60 * 1000) {
      return { ok: false, error: "access token near expiry (custodian push stale?)", status: 503 };
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
  await insertTicket(env, rec);
  await env.TICKET_WF.create({
    id,
    params: { ...body, id, title: rec.title } as TicketParams,
  });
  return { ok: true, ticket: rec };
}
