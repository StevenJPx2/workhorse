// Workflow registry: workflows are USER DATA, not core code.
//
// A workflow entry = @workhorse/workflow spec + optional agent definitions
// + optional control schemas. Stored in KV (`workflow:<name>`), uploadable
// via the API/UI, validated at upload time by the engine's own validator
// (worker-side — no sandbox round-trip). The Docker image keeps seed
// bundles only; POST /workflows/seed imports them into KV (idempotent).
//
// Resolution order at run prepare (agent-run.ts):
//   1. target repo's .workhorse/workflows/<name>/  (teams version their own)
//   2. KV registry entry                            (fleet-wide, user-managed)
//   3. baked /opt/agent/sandbox/workflows/<name>    (seed fallback)

import { getSandbox } from "@cloudflare/sandbox";
import { validateWorkflowSpec } from "@workhorse/workflow";
import type { Env } from "@workhorse/api";

export interface WorkflowEntry {
  name: string;
  /** The workflow spec (validated at upload by @workhorse/workflow). */
  spec: Record<string, unknown>;
  /** Agent definitions (filename → markdown), installed to ~/.pi/agent/agents. */
  agents?: Record<string, string>;
  /** Control schemas (relative path → JSON text), installed next to the spec. */
  schemas?: Record<string, string>;
  source: "seed" | "user";
  updatedAt: string;
}

const KEY = (name: string) => `workflow:${name}`;
export const NAME_RE = /^[\w-]{1,64}$/;

export async function getWorkflow(env: Env, name: string): Promise<WorkflowEntry | null> {
  const raw = await env.TICKETS.get(KEY(name));
  return raw ? (JSON.parse(raw) as WorkflowEntry) : null;
}

export async function listWorkflows(
  env: Env,
): Promise<Array<{ name: string; description?: string; source: string; updatedAt: string }>> {
  const out: Array<{ name: string; description?: string; source: string; updatedAt: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.TICKETS.list({ prefix: "workflow:", cursor });
    for (const key of page.keys) {
      const raw = await env.TICKETS.get(key.name);
      if (!raw) continue;
      const e = JSON.parse(raw) as WorkflowEntry;
      out.push({
        name: e.name,
        description: typeof e.spec.description === "string" ? e.spec.description : undefined,
        source: e.source,
        updatedAt: e.updatedAt,
      });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Validate a spec with the engine's validator. Null when valid. */
export async function validateSpec(_env: Env, spec: unknown): Promise<string | null> {
  const errors = validateWorkflowSpec(spec);
  return errors.length ? errors.join("\n").slice(0, 2000) : null;
}

/** Upsert a workflow after validating its spec. Returns an error string or null. */
export async function putWorkflow(
  env: Env,
  name: string,
  entry: Pick<WorkflowEntry, "spec" | "agents" | "schemas">,
  source: WorkflowEntry["source"] = "user",
): Promise<string | null> {
  if (!NAME_RE.test(name)) return "invalid name (letters/digits/-/_, max 64)";
  if (!entry.spec || typeof entry.spec !== "object") return "spec (object) required";
  const invalid = await validateSpec(env, entry.spec);
  if (invalid) return `spec invalid: ${invalid}`;
  const rec: WorkflowEntry = {
    name,
    spec: entry.spec,
    agents: entry.agents,
    schemas: entry.schemas,
    source,
    updatedAt: new Date().toISOString(),
  };
  await env.TICKETS.put(KEY(name), JSON.stringify(rec));
  // Semantic discovery: keep the workflows corpus fresh (best-effort).
  try {
    const { workflowIndex } = await import("./semindex");
    const stages = ((rec.spec as { artifactGraph?: { stages?: Array<{ id: string }> } }).artifactGraph?.stages ?? []).map((s) => s.id);
    await workflowIndex.upsert(env, [
      { name, description: typeof rec.spec.description === "string" ? rec.spec.description : undefined, stages },
    ]);
  } catch {
    /* discovery never blocks registration */
  }
  return null;
}

export async function deleteWorkflow(env: Env, name: string): Promise<void> {
  await env.TICKETS.delete(KEY(name));
}

/**
 * Seed the registry from the baked bundles (read via a sandbox — the
 * image is the only place they exist). Idempotent: existing USER entries
 * are never overwritten; seed entries are refreshed.
 */
export async function seedWorkflows(
  env: Env,
): Promise<{ seeded: string[]; skipped: string[]; failed: string[] }> {
  const sandbox = getSandbox(env.Sandbox, "wf-validate", { sleepAfter: "1m" });
  // Emit one JSON object for all baked bundles: name → {spec, agents, schemas}.
  await sandbox.writeFile(
    "/tmp/collect.mjs",
    [
      `import { readdirSync, readFileSync, existsSync, statSync } from "fs";`,
      `import { join } from "path";`,
      `const root = "/opt/agent/sandbox/workflows";`,
      `const agentsDir = "/opt/agent/sandbox/agents";`,
      `const out = {};`,
      `const agents = {};`,
      `if (existsSync(agentsDir)) for (const f of readdirSync(agentsDir)) {`,
      `  if (f.endsWith(".md")) agents[f] = readFileSync(join(agentsDir, f), "utf8");`,
      `}`,
      `for (const name of readdirSync(root)) {`,
      `  const dir = join(root, name);`,
      `  if (!statSync(dir).isDirectory()) continue;`,
      `  const specPath = join(dir, "spec.json");`,
      `  if (!existsSync(specPath)) continue;`,
      `  const schemas = {};`,
      `  const schemasDir = join(dir, "schemas");`,
      `  if (existsSync(schemasDir)) for (const f of readdirSync(schemasDir)) {`,
      `    schemas["schemas/" + f] = readFileSync(join(schemasDir, f), "utf8");`,
      `  }`,
      `  out[name] = { spec: JSON.parse(readFileSync(specPath, "utf8")), schemas, agents };`,
      `}`,
      `console.log(JSON.stringify(out));`,
    ].join("\n"),
  );
  const res = await sandbox.exec("node /tmp/collect.mjs", { timeout: 60_000 });
  const bundles = JSON.parse(res.stdout.trim().split("\n").at(-1) ?? "{}") as Record<
    string,
    Pick<WorkflowEntry, "spec" | "agents" | "schemas">
  >;
  const seeded: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const [name, bundle] of Object.entries(bundles)) {
    const existing = await getWorkflow(env, name);
    if (existing && existing.source === "user") {
      skipped.push(name); // never clobber user customization
      continue;
    }
    const err = await putWorkflow(env, name, bundle, "seed");
    if (err) {
      console.warn(`seed ${name} failed: ${err}`);
      failed.push(name);
    } else {
      seeded.push(name);
    }
  }
  return { seeded, skipped, failed };
}
