// Spec validation — the gate behind PUT /workflows and dispatch.
// Collects ALL problems (path-prefixed) instead of failing at the first.

import type { JsonSchema, StageSpec, ToolRef, WorkflowSpec } from "./types";

const ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const CLASSIFICATIONS = new Set(["read-only", "write-capable", "mutation-capable"]);
const THINKING = new Set(["minimal", "low", "medium", "high"]);
const OUTCOMES = new Set(["pr", "report", "artifact"]);
const INPUT_TYPES = new Set(["string", "boolean", "number", "choice"]);

export function froms(s: Pick<StageSpec, "from">): string[] {
  return !s.from ? [] : Array.isArray(s.from) ? s.from : [s.from];
}

function checkTool(t: ToolRef, path: string, errors: string[]): void {
  if (typeof t === "string") {
    if (!t.trim()) errors.push(`${path}: empty tool name`);
    return;
  }
  if (!t.name?.trim()) errors.push(`${path}.name: required`);
  if (!CLASSIFICATIONS.has(t.classification)) {
    errors.push(`${path}.classification: must be one of: read-only, write-capable, mutation-capable`);
  }
}

/** Validate a workflow spec. Returns error strings; empty = valid. */
export function validateWorkflowSpec(spec: unknown): string[] {
  const errors: string[] = [];
  const s = spec as Partial<WorkflowSpec> | null;
  if (!s || typeof s !== "object") return ["spec must be an object"];
  if (s.schemaVersion !== 1) errors.push("$.schemaVersion: must be 1");
  if (!s.name || !ID_RE.test(s.name)) errors.push(`$.name: must match ${ID_RE}`);

  for (const [i, inp] of (s.inputs ?? []).entries()) {
    const p = `$.inputs[${i}]`;
    if (!inp.name || !/^[a-zA-Z][\w-]{0,63}$/.test(inp.name)) errors.push(`${p}.name: invalid`);
    if (!INPUT_TYPES.has(inp.type)) errors.push(`${p}.type: must be string|boolean|number|choice`);
    if (inp.type === "choice" && !inp.options?.length) errors.push(`${p}.options: required for choice`);
  }

  const stages = s.artifactGraph?.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    errors.push("$.artifactGraph.stages: at least one stage required");
    return errors;
  }

  const ids = new Set<string>();
  for (const [i, st] of stages.entries()) {
    const p = `$.artifactGraph.stages[${i}]`;
    if (!st.id || !ID_RE.test(st.id)) errors.push(`${p}.id: must match ${ID_RE}`);
    if (ids.has(st.id)) errors.push(`${p}.id: duplicate "${st.id}"`);
    ids.add(st.id);
    if (st.type && st.type !== "single" && st.type !== "loop") {
      errors.push(`${p}.type: must be single|loop`);
    }
    if (!st.prompt?.trim()) errors.push(`${p}.prompt: required`);
    if (st.thinking && !THINKING.has(st.thinking)) errors.push(`${p}.thinking: invalid`);
    if (st.outcome && !OUTCOMES.has(st.outcome)) errors.push(`${p}.outcome: must be pr|report|artifact`);
    if (st.type === "loop" && !st.until && !st.maxRounds) {
      errors.push(`${p}: loop stage needs until and/or maxRounds`);
    }
    if (st.maxRounds !== undefined && (!Number.isInteger(st.maxRounds) || st.maxRounds < 1)) {
      errors.push(`${p}.maxRounds: positive integer required`);
    }
    for (const [j, t] of (st.tools ?? []).entries()) checkTool(t, `${p}.tools[${j}]`, errors);
  }

  // Edges resolve + graph is acyclic.
  const byId = new Map(stages.map((st) => [st.id, st]));
  for (const [i, st] of stages.entries()) {
    for (const f of froms(st)) {
      if (!byId.has(f)) errors.push(`$.artifactGraph.stages[${i}].from: unknown stage "${f}"`);
    }
  }
  const seen = new Map<string, number>(); // 1 = visiting, 2 = done
  const cyclic = (id: string): boolean => {
    if (seen.get(id) === 2) return false;
    if (seen.get(id) === 1) return true;
    seen.set(id, 1);
    const st = byId.get(id);
    const hit = st ? froms(st).some((f) => byId.has(f) && cyclic(f)) : false;
    seen.set(id, 2);
    return hit;
  };
  if (stages.some((st) => cyclic(st.id))) errors.push("$.artifactGraph: cycle detected");

  // Exactly one terminal (no dependents) stage owns the outcome.
  const hasDependents = new Set(stages.flatMap((st) => froms(st)));
  const terminals = stages.filter((st) => !hasDependents.has(st.id));
  if (terminals.length === 0 && stages.length > 0) {
    errors.push("$.artifactGraph: no terminal stage (cycle?)");
  }
  for (const st of stages) {
    if (st.outcome && hasDependents.has(st.id)) {
      errors.push(`$.artifactGraph: outcome declared on non-terminal stage "${st.id}"`);
    }
  }

  return errors;
}

/** Minimal JSON-schema check (type/required/enum/properties — the subset specs use). */
export function validateAgainstSchema(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const errors: string[] = [];
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [`${path}: expected object`];
    }
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) errors.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`));
    }
    return errors;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (schema.items) {
      value.forEach((v, i) => errors.push(...validateAgainstSchema(v, schema.items!, `${path}[${i}]`)));
    }
    return errors;
  }
  if (schema.type && typeof value !== schema.type) {
    return [`${path}: expected ${schema.type}`];
  }
  if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
    return [`${path}: must be one of ${schema.enum.join(", ")}`];
  }
  return errors;
}
