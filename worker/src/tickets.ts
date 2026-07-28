// Ticket filing — shared by the HTTP API and source plugins (Slack).

import type { Env, TicketParams, TicketRecord } from "@workhorse/api";
import { START_RUNWAY_MS } from "@workhorse/auth";
import { modelToken } from "./auth";
import { db } from "./db";
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

interface EnrichableRef {
  kind: string;
  ref: string;
  label: string;
}

/**
 * Context refs the agent may enrich on demand, deduplicated.
 *
 * Refs come from the PROMPT itself (no manual attach step) plus any explicit
 * attachments from a trigger. Nothing is pre-resolved — the agent fetches a
 * ref's content with fetch_context, so a big Jira thread doesn't bloat every
 * prompt. The repo is cloned, so repo refs are excluded here.
 */
function enrichableRefs(prompt: string, attachments: Array<{ kind: string; ref: string }> = []): EnrichableRef[] {
  const all: EnrichableRef[] = [
    ...parseRefs(prompt).filter((r) => r.kind !== "repo"),
    ...attachments.filter((a) => a.kind !== "repo").map((a) => ({ kind: a.kind, ref: a.ref, label: a.kind })),
  ];

  const seen = new Set<string>();
  return all.filter((r) => {
    const k = `${r.kind}:${r.ref}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Normalize a repo to a clonable URL, accepting bare "owner/name" slugs. */
function repoUrl(repo: string): string {
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}.git` : repo;
}

/** The repo to clone, from the explicit field or a repo attachment. */
function resolveRepo(body: Partial<TicketParams>): string | undefined {
  if (body.repo) return body.repo;
  return body.attachments?.find((a) => a.kind === "repo")?.ref;
}

/**
 * Append the enrichable-refs section to the prompt and record the refs for
 * frecency. Returns the prompt unchanged when there is nothing to enrich.
 */
async function withEnrichableContext(env: Env, prompt: string, attachments?: Array<{ kind: string; ref: string }>) {
  const enrichable = enrichableRefs(prompt, attachments);
  if (!enrichable.length) return prompt;

  await recordRefUse(env, enrichable);

  const list = enrichable.map((r) => `- ${r.kind}: ${r.ref}`).join("\n");
  return `${prompt}\n\n## Available context\nYou can enrich this task with fetch_context(kind, ref) for:\n${list}`;
}

/** Create the registry record + durable workflow instance for a new ticket. */
export async function fileTicket(
  env: Env,
  body: Partial<TicketParams> & { selfOrigin?: string },
): Promise<FileTicketResult> {
  const repo = resolveRepo(body);
  if (!repo || !body.prompt) {
    return { ok: false, error: "repo, prompt required", status: 400 };
  }

  if (!body.accessToken) {
    // Fall back to the custodian-pushed token, requiring enough runway to START
    // a run. Stages re-read the token every turn, so mid-run rotation is the
    // custodian's job — this gate only refuses to begin on fumes.
    const access = await modelToken(env).usable(START_RUNWAY_MS);
    if (!access) {
      return { ok: false, error: "no usable access token (custodian push missing or stale?)", status: 503 };
    }
    body.accessToken = access;
  }

  body.prompt = await withEnrichableContext(env, body.prompt, body.attachments);
  body.repo = repoUrl(repo);
  // Default the workflow at the intake seam so BOTH the record and the
  // workflow-instance params (spread into create below) carry it — the spine
  // reads params.workflow, which would otherwise be undefined.
  body.workflow = body.workflow ?? "coding";
  delete body.selfOrigin;

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

  await db(env).tickets.put(rec);
  await env.TICKET_WF.create({ id, params: { ...body, id, title: rec.title } as TicketParams });

  return { ok: true, ticket: rec };
}
