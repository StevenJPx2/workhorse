// Agent block registry: reusable agent definitions — persona (system
// prompt) + tool ceiling + optional model/thinking defaults — referenced
// from any workflow stage by name (stage.agent). Same registry pattern as
// workflows/scripts: KV entries, seeds from the baked image, user entries
// never clobbered by seeds.
//
// Storage form = the Pi agent file itself (markdown with frontmatter), so
// prepare just writes entries into ~/.pi/agent/agents/<name>.md and the
// engine's stageSession picks up persona + frontmatter tool ceiling.

import { getSandbox } from "@cloudflare/sandbox";
import type { Env } from "@workhorse/api";

export interface AgentBlock {
  name: string;
  description: string;
  /** Tool ceiling (frontmatter `tools:`); empty = open. */
  tools: string[];
  /** Persona markdown (the agent file body). */
  persona: string;
  source: "seed" | "user";
  updatedAt: string;
}

const KEY = (name: string) => `agentblock:${name}`;
export const AGENT_NAME_RE = /^[\w-]{1,64}$/;

/** Render a block as a Pi agent file (what the sandbox consumes). */
export function toAgentFile(b: AgentBlock): string {
  return [
    "---",
    `name: ${b.name}`,
    `description: ${b.description.replace(/\n/g, " ").slice(0, 200)}`,
    ...(b.tools.length ? [`tools: ${b.tools.join(", ")}`] : []),
    "---",
    "",
    b.persona.trim(),
  ].join("\n");
}

/** Parse a Pi agent file into a block (for seeding from baked *.md). */
export function fromAgentFile(name: string, md: string, source: AgentBlock["source"]): AgentBlock {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const get = (k: string) => fm?.[1].match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return {
    name,
    description: get("description") ?? "",
    tools: (get("tools") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    persona: md.replace(/^---[\s\S]*?---\s*/, "").trim(),
    source,
    updatedAt: new Date().toISOString(),
  };
}

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

/** Seed blocks from the baked sandbox/agents/*.md (user entries kept). */
export async function seedAgentBlocks(env: Env): Promise<string[]> {
  const sandbox = getSandbox(env.Sandbox, "wf-validate", { sleepAfter: "1m" });
  const res = await sandbox.exec(
    `for f in /opt/agent/sandbox/agents/*.md; do echo "===FILE=== $(basename $f .md)"; cat "$f"; done 2>/dev/null`,
    { timeout: 30_000 },
  );
  const seeded: string[] = [];
  for (const chunk of res.stdout.split("===FILE=== ").slice(1)) {
    const nl = chunk.indexOf("\n");
    const name = chunk.slice(0, nl).trim();
    const md = chunk.slice(nl + 1);
    if (!AGENT_NAME_RE.test(name)) continue;
    const existing = await getAgentBlock(env, name);
    if (existing && existing.source === "user") continue;
    await putAgentBlock(env, fromAgentFile(name, md, "seed"));
    seeded.push(name);
  }
  return seeded;
}

/** Install every registered block into the sandbox's Pi agents dir. */
export async function installAgentBlocks(env: Env, sandboxId: string): Promise<void> {
  try {
    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
    for (const block of await listAgentBlocks(env)) {
      await sandbox.writeFile(`/root/.pi/agent/agents/${block.name}.md`, toAgentFile(block));
    }
  } catch (err) {
    console.warn("agent block install failed (non-fatal):", err);
  }
}
