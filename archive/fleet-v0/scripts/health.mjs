#!/usr/bin/env node
// Per-package health harness.
//
// Runs `fallow health` scoped to each workspace package and gates on a
// per-package floor recorded in health-baseline.json. The modularization plan
// creates packages one at a time; this is how each one is assessed and cleaned
// BEFORE the next is started, instead of letting debt pool at the root.
//
// Usage:
//   node scripts/health.mjs                 # table + gate against baseline
//   node scripts/health.mjs --update        # record current scores as the new floor
//   node scripts/health.mjs --only db,auth  # scope to specific packages
//   node scripts/health.mjs --json          # machine-readable
//
// Gate rules:
//   - A package below its recorded floor FAILS (regression).
//   - A package above its floor prints the gain and suggests --update.
//   - A NEW package (no baseline) must meet NEW_PACKAGE_FLOOR.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(ROOT, "health-baseline.json");

/** A package created fresh under the plan has no excuse for debt. */
const NEW_PACKAGE_FLOOR = 90;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const UPDATE = flag("update");
const AS_JSON = flag("json");
const ONLY = value("only")?.split(",").map((s) => s.trim()).filter(Boolean);

/** Workspace globs from the root package.json, expanded to real dirs. */
function discoverPackages() {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const out = [];
  for (const pattern of rootPkg.workspaces ?? []) {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      const baseDir = join(ROOT, base);
      if (!existsSync(baseDir)) continue;
      for (const entry of readdirSync(baseDir)) {
        const dir = join(baseDir, entry);
        if (!statSync(dir).isDirectory()) continue;
        if (!existsSync(join(dir, "package.json"))) continue;
        out.push(`${base}/${entry}`);
      }
    } else if (existsSync(join(ROOT, pattern, "package.json"))) {
      out.push(pattern);
    }
  }
  return out.sort();
}

/** Shape one fallow health JSON document into our result record. */
function readScore(raw) {
  const doc = JSON.parse(raw);
  const hs = doc.health_score ?? {};
  return {
    score: typeof hs.score === "number" ? hs.score : null,
    grade: hs.grade ?? "?",
    penalties: Object.fromEntries(Object.entries(hs.penalties ?? {}).filter(([, v]) => v > 0)),
    files: doc.summary?.files_analyzed ?? 0,
  };
}

/**
 * Run fallow health for one package. Fallow exits 1 when it has findings (not
 * a crash) and still writes the JSON document to stdout, so both the success
 * and the throw path parse the same payload.
 *
 * `--production` excludes test/story/dev files from scoring. Without it,
 * adding tests would read as adding debt (more files, more units, more
 * duplication between similar test cases) and every recorded floor would shift
 * the moment a package gained coverage. Health scores the SHIPPED code.
 */
function scorePackage(pkgDir) {
  const run = () =>
    execFileSync(
      "bunx",
      ["fallow", "health", "--score", "--production", "--root", pkgDir, "--format", "json", "--quiet"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  try {
    return readScore(run());
  } catch (err) {
    const raw = err.stdout?.toString?.() ?? "";
    if (raw.trim().startsWith("{")) {
      try {
        return readScore(raw);
      } catch {
        /* malformed — fall through to the error record */
      }
    }
    return { score: null, grade: "ERR", penalties: {}, files: 0, error: true };
  }
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { floors: {} };

let packages = discoverPackages();
if (ONLY) {
  packages = packages.filter((p) => ONLY.some((o) => p === o || p.endsWith(`/${o}`)));
}

const results = [];
for (const pkg of packages) {
  const r = scorePackage(pkg);
  const floor = baseline.floors?.[pkg];
  const isNew = floor === undefined;
  const required = isNew ? NEW_PACKAGE_FLOOR : floor;
  const ok = r.score !== null && r.score >= required - 0.05; // float tolerance
  results.push({ pkg, ...r, floor, required, isNew, ok });
}

if (UPDATE) {
  const floors = { ...baseline.floors };
  for (const r of results) {
    if (r.score !== null) floors[r.pkg] = Math.round(r.score * 10) / 10;
  }
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ note: "Per-package fallow health floors. A package may not regress below its floor. Raise with: node scripts/health.mjs --update", newPackageFloor: NEW_PACKAGE_FLOOR, floors }, null, 2)}\n`,
  );
  console.log(`Recorded ${results.length} package floors → health-baseline.json`);
  process.exit(0);
}

if (AS_JSON) {
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

// ---- table ----
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const w = Math.max(20, ...results.map((r) => r.pkg.length));

console.log(`\n${pad("package", w)}  score  grade  floor  status`);
console.log("─".repeat(w + 34));

for (const r of results) {
  const score = r.score === null ? "  n/a" : padL(r.score.toFixed(1), 5);
  const floorTxt = r.isNew ? padL("new", 5) : padL(r.required.toFixed(1), 5);
  let status;
  if (r.error) status = "✗ fallow error";
  else if (!r.ok) status = `✗ below floor by ${(r.required - r.score).toFixed(1)}`;
  else if (r.isNew) status = "✓ new package";
  else if (r.score > r.required + 0.05) status = `↑ +${(r.score - r.required).toFixed(1)} (--update)`;
  else status = "✓";
  console.log(`${pad(r.pkg, w)}  ${score}  ${padL(r.grade, 5)}  ${floorTxt}  ${status}`);
}

const failures = results.filter((r) => !r.ok);
const gains = results.filter((r) => r.ok && !r.isNew && r.score > r.required + 0.05);

console.log("");
for (const r of failures) {
  const worst = Object.entries(r.penalties).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (worst.length) {
    console.log(
      `  ${r.pkg}: ${worst.map(([k, v]) => `${k.replace(/_/g, " ")} -${v.toFixed(1)}`).join(" · ")}`,
    );
  }
}

if (failures.length) {
  console.log(`\n✗ ${failures.length} package(s) below floor. Fix before starting the next package.`);
  process.exit(1);
}

if (gains.length) {
  console.log(`✓ all ${results.length} packages at or above floor · ${gains.length} improved (run --update to lock in)`);
} else {
  console.log(`✓ all ${results.length} packages at or above floor`);
}
