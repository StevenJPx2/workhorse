// Agent block registry for operator-authored notes and future custom agents.
// Executable workflow agents live in TypeScript packages and do not use this KV
// registry for their persona, tools, or output schema.

import type { Env } from "@workhorse/api";

export interface AgentBlock {
  name: string;
  description: string;
  /** Tool ceiling for a future custom agent. */
  tools: string[];
  /** Persona text for a future custom agent. */
  persona: string;
  source: "seed" | "user";
  updatedAt: string;
}

const KEY = (name: string) => `agentblock:${name}`;
const AGENT_NAME_RE = /^[\w-]{1,64}$/;

export async function getAgentBlock(env: Env, name: string): Promise<AgentBlock | null> {
  const raw = await env.TICKETS.get(KEY(name));
  return raw ? (JSON.parse(raw) as AgentBlock) : null;
}

export async function listAgentBlocks(env: Env): Promise<AgentBlock[]> {
  const out: AgentBlock[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.TICKETS.list({ prefix: "agentblock:", cursor });
    for (const key of page.keys) {
      const raw = await env.TICKETS.get(key.name);
      if (raw) out.push(JSON.parse(raw) as AgentBlock);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putAgentBlock(
  env: Env,
  block: Omit<AgentBlock, "updatedAt">,
): Promise<string | null> {
  if (!AGENT_NAME_RE.test(block.name)) return "invalid name (letters/digits/-/_, max 64)";
  if (!block.persona?.trim()) return "persona required";
  const existing = await getAgentBlock(env, block.name);
  if (existing?.source === "seed" && block.source === "user") {
    // Users may evolve seeds — the entry becomes user-owned (reseeding
    // won't clobber it).
  }
  await env.TICKETS.put(
    KEY(block.name),
    JSON.stringify({ ...block, updatedAt: new Date().toISOString() } satisfies AgentBlock),
  );
  return null;
}

export async function deleteAgentBlock(env: Env, name: string): Promise<void> {
  await env.TICKETS.delete(KEY(name));
}
