#!/usr/bin/env node
// Renders the repo's own quality data as one self-contained HTML page.
//
// Why this exists: every gate we built prints a table to a terminal and then the
// output is gone. A score against a floor can't show that packages/workflow went
// 63.6 -> 90 -> 99.7, or which change caused a drop. This keeps a history and
// draws it.
//
// No runtime deps, no network, no build step — inline CSS and hand-built SVG, so
// the file works from disk and as a CI artifact.
//
//   node scripts/report.mjs             collect + render to reports/index.html
//   node scripts/report.mjs --open      ... and open it
//   node scripts/report.mjs --no-tests  reuse existing test results
//   node scripts/report.mjs --markdown  ALSO print a markdown digest to stdout,
//                                       for >> $GITHUB_STEP_SUMMARY
//   node scripts/report.mjs --assets    ALSO rewrite the COMMITTED README badge,
//                                       trend SVG, and history series
//
// --assets is opt-in and used only by CI on main. Without it, three tracked files
// (README.md, reports/health.svg, reports/history.json) would be rewritten on
// every branch that ran a report — and since CI also rewrites them on main, every
// PR would arrive conflicting in exactly those files. Generated artifacts should
// have ONE writer.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports");
const historyPath = join(outDir, "history.json");

const args = new Set(process.argv.slice(2));
const skipTests = args.has("--no-tests");
const wantMarkdown = args.has("--markdown");
const wantAssets = args.has("--assets");

// The HTML page is the artifact; markdown goes to stdout for the job summary.
// So in markdown mode every progress line must go to stderr, or it lands in the
// middle of the summary.
const log = (msg) => (wantMarkdown ? console.error(msg) : console.log(msg));

/** Run a command for its stdout, returning null instead of throwing. */
function capture(cmd, cmdArgs, { allowFailure = true } = {}) {
  try {
    return execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) {
    // Gate scripts exit nonzero BY DESIGN when they find problems, and that
    // output is exactly what the report is for — so a nonzero exit still yields
    // usable stdout.
    if (allowFailure && err.stdout) return err.stdout;
    return null;
  }
}

/** Parse JSON from a command's stdout, tolerating leading log noise. */
function captureJson(cmd, cmdArgs) {
  const out = capture(cmd, cmdArgs);
  if (!out) return null;
  const start = out.search(/[[{]/);
  if (start === -1) return null;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return null;
  }
}

// ---- collect ----------------------------------------------------------------

log("collecting health…");
const health = captureJson("node", ["scripts/health.mjs", "--json"]);

log("collecting secret contract…");
const secrets = captureJson("node", ["scripts/secrets.mjs", "--json"]);

// Test results come from vitest's JSON reporter. With --no-tests we reuse an
// existing file rather than reporting "not run" — that's how CI avoids running
// the suite twice: the test step writes it, the report step reads it.
const testJsonPath = join(outDir, ".vitest.json");
mkdirSync(outDir, { recursive: true });

if (skipTests) {
  log(existsSync(testJsonPath) ? "reusing existing test results" : "skipping tests (no results available)");
} else {
  log("running tests…");
  capture("bunx", ["vitest", "run", "--reporter=json", `--outputFile=${testJsonPath}`]);
}

let tests = null;
if (existsSync(testJsonPath)) {
  try {
    tests = JSON.parse(readFileSync(testJsonPath, "utf8"));
  } catch {
    tests = null;
  }
}

const git = {
  sha: capture("git", ["rev-parse", "--short", "HEAD"])?.trim() ?? "unknown",
  subject: capture("git", ["log", "-1", "--pretty=%s"])?.trim() ?? "",
  branch: capture("git", ["rev-parse", "--abbrev-ref", "HEAD"])?.trim() ?? "",
};

// ---- history ----------------------------------------------------------------
// Per-package scores over time. Fallow's own snapshots are whole-repo, so they
// can't answer "which package regressed" — this stores the per-package series.

const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, "utf8")) : [];
const scores = Object.fromEntries((health?.results ?? []).map((r) => [r.pkg, r.score]));

const entry = {
  at: new Date().toISOString(),
  sha: git.sha,
  subject: git.subject,
  scores,
  tests: tests ? { total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests } : null,
};

// Re-running on the same commit replaces that commit's entry rather than
// stacking duplicates that would flatten the trend lines.
const sameSha = history.findIndex((h) => h.sha === git.sha);
if (sameSha === -1) history.push(entry);
else history[sameSha] = entry;

// The in-memory series always includes this run so the HTML shows current
// numbers; whether it is PERSISTED depends on --assets.

// ---- render helpers ---------------------------------------------------------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Grade -> colour, matching fallow's A–F scale. */
function gradeColor(grade) {
  return { A: "#22c55e", B: "#84cc16", C: "#eab308", D: "#f97316", F: "#ef4444" }[grade] ?? "#94a3b8";
}

/** A sparkline of a package's score history, or a dash when there's no series. */
function sparkline(series, { w = 120, h = 28 } = {}) {
  const pts = series.filter((v) => typeof v === "number");
  if (pts.length < 2) return `<span class="muted">—</span>`;

  // Fixed 0–100 domain: an auto-scaled axis makes a 2-point wobble look like a
  // cliff, which is exactly the misreading a trend chart should prevent.
  const x = (i) => (i / (pts.length - 1)) * (w - 2) + 1;
  const y = (v) => h - 1 - (v / 100) * (h - 2);
  const path = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const first = pts[0];
  const last = pts[pts.length - 1];
  const stroke = last > first ? "#22c55e" : last < first ? "#ef4444" : "#94a3b8";

  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark" role="img" aria-label="score trend: ${first.toFixed(1)} to ${last.toFixed(1)}">
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2" fill="${stroke}" />
  </svg>`;
}

/** Delta vs the previous run of this package, as a signed badge. */
function delta(pkg) {
  const series = history.map((h) => h.scores?.[pkg]).filter((v) => typeof v === "number");
  if (series.length < 2) return "";
  const diff = series[series.length - 1] - series[series.length - 2];
  if (Math.abs(diff) < 0.05) return `<span class="delta flat">±0</span>`;
  const cls = diff > 0 ? "up" : "down";
  return `<span class="delta ${cls}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}</span>`;
}

// ---- sections ---------------------------------------------------------------

function healthSection() {
  const rows = health?.results ?? [];
  if (!rows.length) return `<p class="muted">No health data.</p>`;

  const failing = rows.filter((r) => !r.ok);
  const byScore = [...rows].sort((a, b) => a.score - b.score);

  const body = byScore
    .map((r) => {
      const series = history.map((h) => h.scores?.[r.pkg]);
      const pen = Object.entries(r.penalties ?? {})
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ");
      return `<tr class="${r.ok ? "" : "bad"}">
        <td class="pkg">${esc(r.pkg)}</td>
        <td class="num"><span class="grade" style="background:${gradeColor(r.grade)}">${esc(r.grade)}</span> ${r.score.toFixed(1)}${delta(r.pkg)}</td>
        <td class="num muted">${r.floor?.toFixed?.(1) ?? "—"}</td>
        <td>${sparkline(series)}</td>
        <td class="num muted">${r.files ?? "—"}</td>
        <td class="pen muted">${esc(pen) || "—"}</td>
      </tr>`;
    })
    .join("");

  return `
    <p>${rows.length} packages · ${failing.length ? `<strong class="bad-text">${failing.length} below floor</strong>` : "all at or above floor"}</p>
    <table>
      <thead><tr><th>package</th><th class="num">score</th><th class="num">floor</th><th>trend</th><th class="num">files</th><th>deductions</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function testSection() {
  if (!tests) return `<p class="muted">Not run (use <code>bun run report</code> without <code>--no-tests</code>).</p>`;

  const { numTotalTests: total, numPassedTests: pass, numFailedTests: fail, numPendingTests: skip } = tests;
  const failures = (tests.testResults ?? [])
    .flatMap((f) => (f.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => ({ file: f.name, title: a.fullName || a.title })))
    .slice(0, 25);

  // Skipped tests are the contract suites — they need real binaries, so a
  // nonzero skip count here is expected rather than a gap.
  return `
    <div class="stats">
      <div class="stat"><b>${pass}</b><span>passed</span></div>
      <div class="stat ${fail ? "bad-text" : ""}"><b>${fail}</b><span>failed</span></div>
      <div class="stat muted"><b>${skip}</b><span>skipped</span></div>
      <div class="stat muted"><b>${total}</b><span>total</span></div>
    </div>
    ${
      failures.length
        ? `<table><thead><tr><th>failed test</th><th>file</th></tr></thead><tbody>${failures
            .map((f) => `<tr class="bad"><td>${esc(f.title)}</td><td class="muted">${esc(f.file.replace(root + "/", ""))}</td></tr>`)
            .join("")}</tbody></table>`
        : `<p class="muted">No failures.</p>`
    }`;
}

function secretSection() {
  if (!secrets) return `<p class="muted">No secret data.</p>`;

  const { entries = [], missingRequired = [], partialGroups = [], orphans = [], undocumented = [], deploymentKnown } = secrets;

  const groups = {};
  for (const e of entries) (groups[e.group] ??= []).push(e);

  const cards = Object.entries(groups)
    .map(([name, members]) => {
      const set = members.filter((m) => m.set).length;
      const partial = partialGroups.find((g) => g.group === name);
      return `<div class="card ${partial ? "bad" : ""}">
        <h4>${esc(name)} <span class="muted">${set}/${members.length}</span></h4>
        <ul>${members
          .map((m) => {
            const mark = m.set ? "✓" : deploymentKnown ? (m.required ? "✗" : "·") : "?";
            const cls = m.set ? "ok" : deploymentKnown && m.required ? "bad-text" : "muted";
            return `<li class="${cls}">${mark} ${esc(m.name)}</li>`;
          })
          .join("")}</ul>
      </div>`;
    })
    .join("");

  const problems = [
    missingRequired.length && `<strong class="bad-text">${missingRequired.length} required missing</strong>: ${missingRequired.map(esc).join(", ")}`,
    partialGroups.length && `<strong class="bad-text">${partialGroups.length} partially configured</strong> — a half-wired surface accepts events it cannot act on`,
    orphans.length && `<strong>${orphans.length} deployed but undeclared</strong>: ${orphans.map(esc).join(", ")}`,
    undocumented.length && `<strong>${undocumented.length} in Env but not in the manifest</strong>: ${undocumented.map(esc).join(", ")}`,
  ].filter(Boolean);

  return `
    ${deploymentKnown ? "" : `<p class="muted">Deployment state unknown (no wrangler auth) — presence shown as <code>?</code>.</p>`}
    ${problems.length ? `<ul class="problems">${problems.map((p) => `<li>${p}</li>`).join("")}</ul>` : `<p class="ok">Contract satisfied.</p>`}
    <div class="cards">${cards}</div>`;
}

function historySection() {
  if (history.length < 2) return `<p class="muted">One run recorded — trends appear from the second run.</p>`;

  const rows = [...history]
    .reverse()
    .slice(0, 20)
    .map((h) => {
      const vals = Object.values(h.scores ?? {}).filter((v) => typeof v === "number");
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const below90 = vals.filter((v) => v < 90).length;
      return `<tr>
        <td class="muted">${esc(h.at.slice(0, 16).replace("T", " "))}</td>
        <td><code>${esc(h.sha)}</code></td>
        <td class="num">${mean === null ? "—" : mean.toFixed(1)}</td>
        <td class="num muted">${below90}</td>
        <td class="num muted">${h.tests ? `${h.tests.passed}/${h.tests.total}` : "—"}</td>
        <td class="subject muted">${esc(h.subject)}</td>
      </tr>`;
    })
    .join("");

  return `<table>
    <thead><tr><th>when</th><th>commit</th><th class="num">mean score</th><th class="num">&lt;90</th><th class="num">tests</th><th>subject</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---- page -------------------------------------------------------------------

const failingCount = (health?.results ?? []).filter((r) => !r.ok).length;
const testsFailing = tests?.numFailedTests ?? 0;
const secretsBroken = (secrets?.missingRequired?.length ?? 0) + (secrets?.partialGroups?.length ?? 0) + (secrets?.undocumented?.length ?? 0);
const allGreen = !failingCount && !testsFailing && !secretsBroken;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workhorse — quality report</title>
<style>
  :root {
    --bg: #0b1020; --panel: #131a2e; --line: #243049;
    --text: #e6ecf7; --muted: #8b9ab5; --ok: #22c55e; --bad: #ef4444;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f7f9fc; --panel: #fff; --line: #e2e8f0; --text: #0f172a; --muted: #64748b; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.5rem 4rem; background: var(--bg); color: var(--text);
    font: 14px/1.55 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 0 0 .75rem; letter-spacing: .01em; }
  h4 { margin: 0 0 .4rem; font-size: .9rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; }
  .sub { color: var(--muted); margin: 0 0 1.5rem; }
  .verdict {
    display: inline-block; padding: .3rem .7rem; border-radius: 999px;
    font-weight: 600; font-size: .8rem; letter-spacing: .04em; text-transform: uppercase;
  }
  .verdict.pass { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
  .verdict.fail { background: color-mix(in srgb, var(--bad) 18%, transparent); color: var(--bad); }
  section {
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 1.1rem 1.25rem; margin: 0 0 1.1rem;
  }
  table { width: 100%; border-collapse: collapse; margin-top: .5rem; }
  th, td { text-align: left; padding: .42rem .5rem; border-bottom: 1px solid var(--line); }
  th { font-size: .74rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
  tbody tr:last-child td { border-bottom: 0; }
  tr.bad { background: color-mix(in srgb, var(--bad) 8%, transparent); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pkg { font-family: ui-monospace, Menlo, monospace; font-size: .88em; }
  .pen, .subject { font-size: .82em; }
  .muted { color: var(--muted); }
  .ok { color: var(--ok); }
  .bad-text { color: var(--bad); }
  .grade {
    display: inline-block; width: 1.35em; text-align: center; border-radius: 4px;
    color: #05080f; font-weight: 700; font-size: .78em; margin-right: .3rem;
  }
  .spark { display: block; }
  .delta { margin-left: .45rem; font-size: .78em; font-variant-numeric: tabular-nums; }
  .delta.up { color: var(--ok); } .delta.down { color: var(--bad); } .delta.flat { color: var(--muted); }
  .stats { display: flex; gap: 1.75rem; margin: .25rem 0 .75rem; }
  .stat { display: flex; flex-direction: column; }
  .stat b { font-size: 1.5rem; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .stat span { font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: .7rem; margin-top: .75rem; }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: .6rem .7rem; }
  .card.bad { border-color: var(--bad); }
  .card ul { list-style: none; margin: 0; padding: 0; }
  .card li { font-family: ui-monospace, Menlo, monospace; font-size: .78em; padding: .05rem 0; }
  .problems { margin: .3rem 0 0; padding-left: 1.1rem; }
  .problems li { margin: .2rem 0; }
  footer { color: var(--muted); font-size: .8rem; text-align: center; margin-top: 2rem; }
</style>
</head>
<body>
<main>
  <h1>Workhorse — quality report</h1>
  <p class="sub">
    <span class="verdict ${allGreen ? "pass" : "fail"}">${allGreen ? "green" : "attention"}</span>
    <code>${esc(git.branch)}</code> @ <code>${esc(git.sha)}</code> · ${esc(git.subject)}<br>
    generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC
  </p>

  <section>
    <h2>Package health</h2>
    ${healthSection()}
  </section>

  <section>
    <h2>Tests</h2>
    ${testSection()}
  </section>

  <section>
    <h2>Secret contract</h2>
    ${secretSection()}
  </section>

  <section>
    <h2>History</h2>
    ${historySection()}
  </section>

  <footer>
    Generated by <code>scripts/report.mjs</code> — no network, no runtime deps.<br>
    Scores exclude test files (<code>fallow --production</code>), so coverage never reads as debt.
  </footer>
</main>
</body>
</html>`;

// ---- README assets ----------------------------------------------------------
// The HTML report lives in an artifact nobody opens. These three land on the
// README, where they're seen without asking for them.
//
// SVG CONSTRAINT: GitHub sanitizes markdown-embedded SVG, so this uses
// presentation attributes (fill=, stroke=) ONLY — no <style>, no CSS, no
// currentColor. Colours are mid-tones that read on both light and dark.

/** Mean of the numeric values in a run's score map. */
function meanScore(run) {
  const vals = Object.values(run.scores ?? {}).filter((v) => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Trend chart: mean score per run, with a min–max band showing spread. The band
 * is the point — a healthy mean can hide one package at 40, and that's exactly
 * the thing a single number lets you ignore.
 */
function trendSvg() {
  const W = 720;
  const H = 200;
  const pad = { t: 18, r: 14, b: 26, l: 34 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const runs = history.filter((h) => meanScore(h) !== null);
  const series = runs.map((h) => {
    const vals = Object.values(h.scores).filter((v) => typeof v === "number");
    return { mean: meanScore(h), min: Math.min(...vals), max: Math.max(...vals), sha: h.sha };
  });

  // Fixed 0–100 domain, same rule as everywhere else: an auto-scaled axis turns
  // a 2-point wobble into a cliff.
  const x = (i) => pad.l + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const y = (v) => pad.t + plotH - (v / 100) * plotH;

  const gridLines = [0, 25, 50, 75, 100]
    .map(
      (v) =>
        `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${W - pad.r}" y2="${y(v).toFixed(1)}" stroke="#8b9ab5" stroke-width="0.5" stroke-opacity="0.25" />` +
        `<text x="${pad.l - 6}" y="${(y(v) + 3.5).toFixed(1)}" font-size="9" fill="#8b9ab5" text-anchor="end" font-family="ui-monospace, monospace">${v}</text>`,
    )
    .join("");

  // Band as one closed path: max across, min back.
  const band =
    series.length > 1
      ? `<path d="${series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.max).toFixed(1)}`).join(" ")} ${series
          .slice()
          .reverse()
          .map((s, i) => `L${x(series.length - 1 - i).toFixed(1)},${y(s.min).toFixed(1)}`)
          .join(" ")} Z" fill="#6366f1" fill-opacity="0.16" stroke="none" />`
      : "";

  const meanPath =
    series.length > 1
      ? `<path d="${series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.mean).toFixed(1)}`).join(" ")}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" />`
      : "";

  const dots = series
    .map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.mean).toFixed(1)}" r="2.5" fill="#6366f1" />`)
    .join("");

  const last = series[series.length - 1];
  const worstPkg = [...(health?.results ?? [])].sort((a, b) => a.score - b.score)[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Package health trend: mean ${last?.mean.toFixed(1)}, lowest ${last?.min.toFixed(1)}">
  <text x="${pad.l}" y="12" font-size="11" fill="#8b9ab5" font-family="ui-sans-serif, system-ui, sans-serif">package health · mean ${last ? last.mean.toFixed(1) : "—"} · range ${last ? `${last.min.toFixed(0)}–${last.max.toFixed(0)}` : "—"}${worstPkg ? ` · lowest: ${worstPkg.pkg}` : ""}</text>
  ${gridLines}
  ${band}
  ${meanPath}
  ${dots}
  <text x="${pad.l}" y="${H - 8}" font-size="9" fill="#8b9ab5" font-family="ui-monospace, monospace">${series[0]?.sha ?? ""}</text>
  <text x="${W - pad.r}" y="${H - 8}" font-size="9" fill="#8b9ab5" text-anchor="end" font-family="ui-monospace, monospace">${last?.sha ?? ""}</text>
  <text x="${W / 2}" y="${H - 8}" font-size="9" fill="#8b9ab5" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">${series.length} run${series.length === 1 ? "" : "s"} · shaded band = spread across packages</text>
</svg>
`;
}

/** shields.io endpoint payload — a live badge without a third-party service. */
function badgeJson() {
  const rows = health?.results ?? [];
  const failing = rows.filter((r) => !r.ok).length;
  const mean = rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0;

  return {
    schemaVersion: 1,
    label: "health",
    // The mean alone would read as "fine" while a package sits below floor, so
    // a breach is stated in the badge text rather than hidden behind the colour.
    message: failing ? `${mean.toFixed(1)} · ${failing} below floor` : mean.toFixed(1),
    color: failing ? "red" : mean >= 95 ? "brightgreen" : mean >= 85 ? "green" : mean >= 70 ? "yellow" : "orange",
  };
}

/** Compact per-package table for the README, between HTML markers. */
function readmeTable() {
  const rows = [...(health?.results ?? [])].sort((a, b) => a.score - b.score);
  const out = [];

  const testLine = tests ? `${tests.numPassedTests} passing` : "—";
  const failing = rows.filter((r) => !r.ok);

  out.push(`![health](reports/health.svg)`, "");
  out.push(`**${rows.length} packages** · ${testLine} · ${failing.length ? `⚠️ ${failing.length} below floor` : "all at or above floor"}`, "");
  out.push("| package | grade | score | trend |", "|---|---|---:|---|");

  for (const r of rows) {
    out.push(`| \`${r.pkg}\` | ${r.grade} | ${r.score.toFixed(1)}${deltaText(r.pkg)} | \`${blocks(history.map((h) => h.scores?.[r.pkg]))}\` |`);
  }

  out.push("", `<sub>Generated by \`bun run report\` · fixed 0–100 scale · test files excluded from scoring</sub>`);
  return out.join("\n");
}

/** Replace the marked block in README.md, leaving everything else untouched. */
function updateReadme(table) {
  const path = join(root, "README.md");
  if (!existsSync(path)) return false;

  const start = "<!-- quality:start -->";
  const end = "<!-- quality:end -->";
  const body = readFileSync(path, "utf8");

  // No markers means the README hasn't opted in — silently doing nothing beats
  // guessing where the section belongs.
  if (!body.includes(start) || !body.includes(end)) return false;

  const before = body.slice(0, body.indexOf(start) + start.length);
  const after = body.slice(body.indexOf(end));
  const next = `${before}\n${table}\n${after}`;

  if (next === body) return false;
  writeFileSync(path, next);
  return true;
}

// ---- markdown digest --------------------------------------------------------
// For $GITHUB_STEP_SUMMARY, which renders on the run page itself — no download,
// no publishing. Markdown only, so trends become unicode blocks instead of SVG.

/** Score history as block characters, on the same fixed 0–100 domain as the SVG. */
function blocks(series) {
  const pts = series.filter((v) => typeof v === "number");
  if (pts.length < 2) return "—";

  const bars = "▁▂▃▄▅▆▇█";
  // Fixed domain: a package flat at 100 reads as a solid wall, which is the
  // truth. Auto-scaling would turn its noise floor into dramatic peaks.
  return pts.map((v) => bars[Math.min(7, Math.max(0, Math.round((v / 100) * 7)))]).join("");
}

/** Signed delta vs the previous run, as plain text. */
function deltaText(pkg) {
  const series = history.map((h) => h.scores?.[pkg]).filter((v) => typeof v === "number");
  if (series.length < 2) return "";
  const diff = series[series.length - 1] - series[series.length - 2];
  if (Math.abs(diff) < 0.05) return "";
  return ` ${diff > 0 ? "+" : ""}${diff.toFixed(1)}`;
}

function markdown() {
  const rows = health?.results ?? [];
  const failing = rows.filter((r) => !r.ok);
  const moved = rows.filter((r) => deltaText(r.pkg) !== "");
  const out = [];

  out.push(`## ${allGreen ? "✅" : "⚠️"} Quality report`);
  out.push("");

  // Headline numbers first — this is the part read at a glance.
  const testLine = tests
    ? `**${tests.numPassedTests}** passed${tests.numFailedTests ? ` · **${tests.numFailedTests} failed**` : ""}${tests.numPendingTests ? ` · ${tests.numPendingTests} skipped` : ""}`
    : "not run";
  out.push(
    `| tests | packages | secret contract |`,
    `|---|---|---|`,
    `| ${testLine} | ${failing.length ? `**${failing.length} below floor**` : `all ${rows.length} at floor`} | ${secretsBroken ? `**${secretsBroken} issue${secretsBroken === 1 ? "" : "s"}**` : "satisfied"} |`,
    "",
  );

  // Failures, named. A summary that says "3 failed" without saying which is a
  // link to somewhere else, not a summary.
  const failures = (tests?.testResults ?? [])
    .flatMap((f) => (f.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => a.fullName || a.title))
    .slice(0, 15);
  if (failures.length) {
    out.push("### Failed tests", "");
    for (const t of failures) out.push(`- \`${t}\``);
    out.push("");
  }

  if (failing.length) {
    out.push("### Below floor", "", `| package | score | floor | deductions |`, `|---|---:|---:|---|`);
    for (const r of failing) {
      const pen = Object.entries(r.penalties ?? {})
        .map(([k, v]) => `${k} ${v}`)
        .join(", ");
      out.push(`| \`${r.pkg}\` | **${r.score.toFixed(1)}** | ${r.floor?.toFixed?.(1) ?? "—"} | ${pen || "—"} |`);
    }
    out.push("");
  }

  if (moved.length) {
    out.push("### Moved since last run", "", `| package | score | change | trend |`, `|---|---:|---:|---|`);
    for (const r of moved) {
      out.push(
        `| \`${r.pkg}\` | ${r.score.toFixed(1)} | ${deltaText(r.pkg).trim()} | \`${blocks(history.map((h) => h.scores?.[r.pkg]))}\` |`,
      );
    }
    out.push("");
  }

  // The full table is collapsed: 20 rows of "100.0 A" is noise when nothing
  // moved, but it's what you want the moment you're looking for one package.
  out.push("<details><summary>All packages</summary>", "", `| package | grade | score | floor | trend |`, `|---|---|---:|---:|---|`);
  for (const r of [...rows].sort((a, b) => a.score - b.score)) {
    out.push(
      `| \`${r.pkg}\` | ${r.grade} | ${r.score.toFixed(1)}${deltaText(r.pkg)} | ${r.floor?.toFixed?.(1) ?? "—"} | \`${blocks(history.map((h) => h.scores?.[r.pkg]))}\` |`,
    );
  }
  out.push("", "</details>", "");

  const problems = [
    secrets?.missingRequired?.length && `${secrets.missingRequired.length} required secret(s) missing: ${secrets.missingRequired.join(", ")}`,
    secrets?.partialGroups?.length &&
      `${secrets.partialGroups.length} partially configured group(s) — a half-wired surface accepts events it cannot act on`,
    secrets?.undocumented?.length && `${secrets.undocumented.length} field(s) in \`Env\` but not in the manifest: ${secrets.undocumented.join(", ")}`,
    secrets?.orphans?.length && `${secrets.orphans.length} deployed but undeclared: ${secrets.orphans.join(", ")}`,
  ].filter(Boolean);

  if (problems.length) {
    out.push("### Secret contract", "");
    for (const p of problems) out.push(`- ${p}`);
    out.push("");
  }

  out.push(
    `<sub>Trends on a fixed 0–100 scale, so a flat line is genuinely flat. Scores exclude test files. Full report with SVG trends is the <strong>quality-report</strong> artifact.</sub>`,
  );

  return out.join("\n");
}

// ---- write ------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

// Always written; gitignored.
const outPath = join(outDir, "index.html");
writeFileSync(outPath, html);

// Tracked files. Written ONLY under --assets so that the single writer is CI on
// main — see the --assets note at the top of this file.
if (wantAssets) {
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  writeFileSync(join(outDir, "health.svg"), trendSvg());
  writeFileSync(join(outDir, "badge.json"), `${JSON.stringify(badgeJson(), null, 2)}\n`);

  if (updateReadme(readmeTable())) log("  README.md updated");
  log("  committed assets refreshed (history, health.svg, badge.json)");
}

log(`\n  ${outPath}`);
log(`  ${history.length} run${history.length === 1 ? "" : "s"} recorded · ${allGreen ? "all green" : "needs attention"}\n`);

if (wantMarkdown) console.log(markdown());

if (args.has("--open")) capture("open", [outPath]);
