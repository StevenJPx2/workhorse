#!/usr/bin/env node
// Verify the deployed worker against secrets.json — the secret CONTRACT.
//
// With ~24 secrets and vars across 8 surfaces, "is this configured?" stopped
// being answerable by reading code. This closes the loop three ways:
//
//   drift      declared in Env/secrets.json but NOT deployed, or deployed but
//              undeclared (an orphan nobody can explain)
//   partial    an all-or-nothing group with SOME members set — a half-wired
//              surface, which is worse than an unconfigured one because it
//              accepts events it cannot act on
//   guidance   what breaks without each one, and where to get it
//
// Values are NEVER read, printed, or transmitted. The Cloudflare secrets API
// returns names only, which is exactly what this needs.
//
// Usage:
//   node scripts/secrets.mjs            # audit the deployed worker
//   node scripts/secrets.mjs --missing  # only what's absent, with obtain steps
//   node scripts/secrets.mjs --json     # machine-readable (CI)

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "secrets.json"), "utf8"));

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const missingOnly = args.includes("--missing");

/** Secret NAMES on the deployed worker (never values). */
function deployedSecrets() {
  try {
    const raw = execFileSync("bunx", ["wrangler", "secret", "list", "--format", "json"], {
      cwd: join(root, "worker"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // wrangler prints a banner before the JSON, so start at the array.
    const start = raw.indexOf("[");
    if (start === -1) return null;
    return JSON.parse(raw.slice(start)).map((s) => s.name);
  } catch {
    return null;
  }
}

/** Plain vars from wrangler.jsonc (public config, not secrets). */
function configuredVars() {
  try {
    const raw = readFileSync(join(root, "worker", "wrangler.jsonc"), "utf8");
    // Only the vars block matters, and JSONC comments make a full parse fragile.
    const block = raw.slice(raw.indexOf('"vars"'));
    const end = block.indexOf("}");
    return [...block.slice(0, end).matchAll(/"([A-Z0-9_]+)"\s*:/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/**
 * Env fields that are BINDINGS (KV, D1, R2, DO, Workflow, AI, Vectorize), not
 * secrets. They are declared in wrangler.jsonc as bindings and provisioned by
 * the platform, so the manifest deliberately does not track them — flagging
 * them as "undocumented secrets" would be noise.
 */
const BINDING_TYPES =
  /:\s*(KVNamespace|D1Database|R2Bucket|DurableObjectNamespace|Workflow|Ai|VectorizeIndex|AiSearchNamespace|WorkerLoader|Fetcher|Queue|Service|AnalyticsEngineDataset|Hyperdrive)/;

/** Env interface fields that are string config — the code's own declaration. */
function declaredInEnv() {
  try {
    const raw = readFileSync(join(root, "packages", "api", "src", "types.ts"), "utf8");
    const start = raw.indexOf("export interface Env {");
    if (start === -1) return [];
    const body = raw.slice(start, raw.indexOf("\n}", start));

    return [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*)\??:.*$/gm)]
      .filter((m) => !BINDING_TYPES.test(m[0]))
      .map((m) => m[1]);
  } catch {
    return [];
  }
}

const secrets = deployedSecrets();
if (secrets === null && !jsonOut) {
  console.error("Could not list deployed secrets (wrangler not authenticated?).");
  console.error("Showing the manifest contract only — deployment state unknown.\n");
}

const vars = configuredVars();
const envFields = declaredInEnv();
const present = new Set([...(secrets ?? []), ...vars]);

const rows = manifest.entries.map((e) => {
  const group = manifest.groups[e.group] ?? {};
  return {
    ...e,
    // An entry inherits its group's requirement unless it overrides.
    required: e.required ?? group.required ?? false,
    set: present.has(e.name),
    inEnv: envFields.includes(e.name),
  };
});

const declared = new Set(rows.map((r) => r.name));
const orphans = [...present].filter((n) => !declared.has(n));
const undocumented = envFields.filter((n) => !declared.has(n));

// A group that is all-or-nothing and PARTIALLY set is the dangerous state: the
// surface is live enough to receive events but not complete enough to act.
const partial = Object.entries(manifest.groups)
  .filter(([, g]) => g.allOrNothing)
  .map(([name, g]) => {
    const members = rows.filter((r) => r.group === name && (r.required ?? true) !== false);
    const set = members.filter((m) => m.set);
    return { group: name, description: g.description, set: set.map((m) => m.name), missing: members.filter((m) => !m.set).map((m) => m.name) };
  })
  .filter((g) => g.set.length > 0 && g.missing.length > 0);

const missingRequired = rows.filter((r) => r.required && !r.set);

if (jsonOut) {
  console.log(
    JSON.stringify(
      {
        worker: manifest.worker,
        deploymentKnown: secrets !== null,
        entries: rows.map(({ name, kind, group, required, set, inEnv }) => ({ name, kind, group, required, set, inEnv })),
        missingRequired: missingRequired.map((r) => r.name),
        partialGroups: partial,
        orphans,
        undocumented,
      },
      null,
      2,
    ),
  );
  process.exit(missingRequired.length || partial.length ? 1 : 0);
}

const mark = (r) => (r.set ? "✓" : r.required ? "✗" : "·");

if (missingOnly) {
  const gaps = rows.filter((r) => !r.set);
  if (!gaps.length) {
    console.log("Everything in the manifest is configured.");
    process.exit(0);
  }
  for (const r of gaps) {
    console.log(`\n${r.required ? "REQUIRED" : "optional"}  ${r.name}  (${r.kind}, ${r.group})`);
    console.log(`  purpose:  ${r.purpose}`);
    console.log(`  without:  ${r.withoutIt}`);
    console.log(`  obtain:   ${r.obtain}`);
    if (r.kind === "secret") console.log(`  set with: cd worker && bunx wrangler secret put ${r.name}`);
    else console.log(`  set with: add "${r.name}" to the vars block in worker/wrangler.jsonc`);
  }
  process.exit(missingRequired.length ? 1 : 0);
}

console.log(`\nSecret contract — ${manifest.worker}${secrets === null ? "  (deployment state UNKNOWN)" : ""}\n`);

for (const [groupName, group] of Object.entries(manifest.groups)) {
  const members = rows.filter((r) => r.group === groupName);
  if (!members.length) continue;
  const setCount = members.filter((m) => m.set).length;
  console.log(`${groupName}  ${setCount}/${members.length}${group.allOrNothing ? "  (all-or-nothing)" : ""}`);
  for (const r of members) {
    const notInEnv = r.inEnv ? "" : "  [not in Env interface]";
    console.log(`  ${mark(r)} ${r.name.padEnd(24)} ${r.kind.padEnd(6)}${notInEnv}`);
  }
  console.log();
}

if (missingRequired.length) {
  console.log(`✗ MISSING REQUIRED (${missingRequired.length}):`);
  for (const r of missingRequired) console.log(`    ${r.name} — ${r.withoutIt}`);
  console.log();
}

if (partial.length) {
  console.log("⚠ PARTIALLY CONFIGURED — a half-wired surface accepts events it cannot act on:");
  for (const g of partial) {
    console.log(`    ${g.group}: set [${g.set.join(", ")}], missing [${g.missing.join(", ")}]`);
  }
  console.log();
}

if (orphans.length) {
  console.log(`⚠ DEPLOYED BUT UNDECLARED (${orphans.length}) — nobody can explain these:`);
  for (const n of orphans) console.log(`    ${n} — add it to secrets.json or delete it`);
  console.log();
}

if (undocumented.length) {
  console.log(`⚠ IN Env INTERFACE BUT NOT IN MANIFEST (${undocumented.length}):`);
  for (const n of undocumented) console.log(`    ${n}`);
  console.log();
}

const clean = !missingRequired.length && !partial.length && !orphans.length && !undocumented.length;
console.log(clean ? "✓ contract satisfied" : "run with --missing for setup steps");
process.exit(missingRequired.length || partial.length ? 1 : 0);
