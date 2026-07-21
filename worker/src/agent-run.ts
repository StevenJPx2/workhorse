import { getSandbox } from "@cloudflare/sandbox";
import type { Env } from "@workhorse/api";

const PI = "pi"; // /usr/local/bin/pi shim baked into the image
const PI_WORKFLOW_CLI =
  "/root/.pi/agent/npm/node_modules/@agwab/pi-workflow/src/cli.mjs";
const PI_WORKFLOW_DIST =
  "/root/.pi/agent/npm/node_modules/@agwab/pi-workflow/dist";

/** Write the short-lived OAuth access token into the sandbox's Pi home. */
export async function injectAuth(env: Env, sandboxId: string, accessToken: string) {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const auth = {
    anthropic: {
      type: "oauth",
      access: accessToken,
      refresh: "",
      // Pi only checks expiry locally; real expiry is enforced server-side.
      expires: Date.now() + 4 * 3600 * 1000,
    },
  };
  await sandbox.writeFile("/root/.pi/agent/auth.json", JSON.stringify(auth));
}

/**
 * Write the browser plane's callback config into the sandbox: the Worker's
 * own public URL + the SCOPED browser token (never the master token). The
 * sandbox-half browser tool reads this to call POST /browser. No-ops when
 * the browser plane isn't configured, so runs never fail on its absence.
 */
export async function injectBrowserConfig(env: Env, sandboxId: string): Promise<void> {
  if (!env.SELF_URL || !env.BROWSER_TOKEN) return;
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.writeFile(
    "/root/.workhorse-browser.json",
    JSON.stringify({ url: env.SELF_URL, token: env.BROWSER_TOKEN }),
  );
}

const MC_DIR = "/root/.local/share/cortexkit/magic-context";
const MC_DB = `${MC_DIR}/context.db`;
/** KV cap is 25 MiB; leave headroom for base64→binary slack. */
const MC_MAX_BYTES = 24 * 1024 * 1024;

/** Stable per-repo key for the fleet memory store. */
function memoryKey(repo: string): string {
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return `mc:${m ? `${m[1]}/${m[2]}` : repo.replace(/[^a-zA-Z0-9_/-]/g, "_")}`;
}

/**
 * Restore the repo's Magic Context database into the sandbox so the agent
 * starts with the fleet's accumulated memories for this repo. Memories are
 * keyed to stable project identity (git root commit hash), so the same repo
 * resolves to the same memories in every sandbox.
 */
export async function restoreMemory(env: Env, sandboxId: string, repo: string): Promise<boolean> {
  const b64 = await env.TICKETS.get(memoryKey(repo));
  if (!b64) return false;
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.writeFile("/workspace/.mc-db.b64", b64);
  const res = await sandbox.exec(
    `mkdir -p ${MC_DIR} && base64 -d /workspace/.mc-db.b64 > ${MC_DB} && rm /workspace/.mc-db.b64 && stat -c%s ${MC_DB}`,
    { timeout: 60_000 },
  );
  return res.exitCode === 0;
}

/**
 * Persist the sandbox's Magic Context database back to KV (WAL-checkpointed
 * via node:sqlite, base64 over the exec channel). Never throws — memory
 * persistence must not fail a ticket.
 */
export async function persistMemory(env: Env, sandboxId: string, repo: string): Promise<boolean> {
  try {
    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
    const res = await sandbox.exec(
      [
        `[ -f ${MC_DB} ] || exit 3`,
        // Fold WAL into the main file so one file is the whole state.
        `node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('${MC_DB}');d.exec('PRAGMA wal_checkpoint(TRUNCATE)');d.close()" 2>/dev/null || true`,
        `[ "$(stat -c%s ${MC_DB})" -le ${MC_MAX_BYTES} ] || exit 4`,
        `base64 -w0 ${MC_DB}`,
      ].join(" && "),
      { timeout: 120_000 },
    );
    if (res.exitCode === 3) return false; // no db — MC never ran
    if (res.exitCode === 4) {
      console.warn(`MC db for ${repo} exceeds KV cap; skipping persist`);
      return false;
    }
    const b64 = res.stdout.trim();
    if (res.exitCode !== 0 || b64.length < 100) return false;
    await env.TICKETS.put(memoryKey(repo), b64);
    return true;
  } catch (err) {
    console.warn(`MC persist failed for ${repo}:`, err);
    return false;
  }
}

/**
 * Prepare the workspace: clone the repo, install the Workhorse workflow
 * bundle, and keep pi-workflow run artifacts out of the git diff.
 */
export async function prepareWorkspace(
  env: Env,
  sandboxId: string,
  repo: string,
  model?: string,
  workflow = "coding",
) {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  // Guard the workflow name (it lands in shell paths): letters/digits/-/_ only.
  const wf = /^[\w-]+$/.test(workflow) ? workflow : "coding";
  // Evals: patch the model override into the workspace spec copy.
  const patchModel = model
    ? `node -e 'const f=".pi/workflows/${wf}/spec.json",s=require("/workspace/repo/"+f);s.defaults.model=${JSON.stringify(model)};require("fs").writeFileSync(f,JSON.stringify(s,null,2))'`
    : "true";
  const result = await sandbox.exec(
    [
      `[ -d /workspace/repo/.git ] || git clone --depth 50 ${JSON.stringify(repo)} /workspace/repo`,
      `cd /workspace/repo`,
      `mkdir -p .pi/workflows`,
      `cp -R /opt/agent/sandbox/workflows/${wf} .pi/workflows/${wf}`,
      patchModel,
      // Keep run artifacts out of diffs/PRs without touching tracked files.
      `grep -q "^\\.pi/$" .git/info/exclude 2>/dev/null || echo ".pi/" >> .git/info/exclude`,
      `git config user.email "workhorse@stevenjohn.co" && git config user.name "Workhorse"`,
    ].join(" && "),
    { timeout: 180_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`workspace prep failed: ${(result.stderr || result.stdout).slice(-500)}`);
  }
}

/** Start the named workflow for a task. Returns the pi-workflow run id. */
export async function startWorkflow(
  env: Env,
  sandboxId: string,
  task: string,
  workflow = "coding",
): Promise<string> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const wf = /^[\w-]+$/.test(workflow) ? workflow : "coding";
  // Write the slash command to a file to sidestep shell-quoting pitfalls.
  const slash = `/workflow run ${wf} ${JSON.stringify(task)}`;
  await sandbox.writeFile("/workspace/.task", slash);
  const result = await sandbox.exec(
    `cd /workspace/repo && timeout 240 ${PI} -p -np "$(cat /workspace/.task)" 2>&1 | tail -20`,
    { timeout: 280_000 },
  );
  const m = result.stdout.match(/workflow_[a-z0-9]+_[a-f0-9]+/);
  if (!m) {
    throw new Error(`workflow did not start: ${result.stdout.slice(-800)}`);
  }
  return m[0];
}

/** One burst's view of the run, including escalation-relevant signals. */
export interface DriveReport {
  status: string;
  tasks: Array<{ id: string; status: string; detail?: string }>;
  /**
   * True when the run's failure traces back to the MODEL plane (429, credit
   * exhaustion, expired OAuth token — pi-workflow failureKind "model" /
   * statusDetail *model*). The availability-fallback chain applies.
   */
  modelFailure?: boolean;
  /**
   * A COMPLETED stage whose control block carried `"delegate": true` — the
   * agent judged itself under-equipped. The capability-promotion chain
   * applies (re-run that stage one model up).
   */
  delegating?: { taskId: string; model?: string; reason?: string };
}

/**
 * Post-burst inspection: run/task status plus the two escalation signals
 * (model-plane failure, delegate requests in completed stages' control.json).
 */
const INSPECT_RUN_SCRIPT = `
import fs from "fs";
import path from "path";
const runId = process.argv[2];
const repo = "/workspace/repo";
const wfDir = path.join(repo, ".pi/workflows", runId);
const run = JSON.parse(fs.readFileSync(path.join(wfDir, "run.json"), "utf8"));
const tasks = (run.tasks ?? []).map((t) => ({
  id: t.specId || t.taskId,
  status: t.status,
  ...(t.statusDetail && t.statusDetail !== t.status ? { detail: t.statusDetail } : {}),
}));
let modelFailure = false;
for (const t of run.tasks ?? []) {
  if (t.status !== "failed") continue;
  if (/model/i.test(String(t.statusDetail ?? ""))) { modelFailure = true; continue; }
  try {
    const res = JSON.parse(fs.readFileSync(path.resolve(repo, t.files.result), "utf8"));
    if (/model/i.test(String(res.failureKind ?? ""))) modelFailure = true;
  } catch {}
}
let compiled = { tasks: [] };
try { compiled = JSON.parse(fs.readFileSync(path.join(wfDir, "compiled.json"), "utf8")); } catch {}
const modelOf = (specId) => {
  const ct = (compiled.tasks ?? []).find((c) => (c.specId || c.id) === specId);
  return ct?.runtime?.model;
};
let delegating;
for (const t of run.tasks ?? []) {
  if (t.status !== "completed" || !t.files?.result) continue;
  try {
    const dir = path.dirname(path.resolve(repo, t.files.result));
    const control = JSON.parse(fs.readFileSync(path.join(dir, "control.json"), "utf8"));
    if (control?.delegate === true) {
      const specId = t.specId || t.taskId;
      delegating = {
        taskId: specId,
        ...(modelOf(specId) ? { model: modelOf(specId) } : {}),
        ...(typeof control.delegateReason === "string"
          ? { reason: control.delegateReason.slice(0, 300) }
          : {}),
      };
      break;
    }
  } catch {}
}
console.log(JSON.stringify({ status: run.status, tasks, ...(modelFailure ? { modelFailure } : {}), ...(delegating ? { delegating } : {}) }));
`;

/**
 * Drive the workflow graph forward for ONE short burst (~drainMs) and report
 * status. Long-lived execs through the sandbox DO die silently, so the
 * caller loops short bursts instead (idempotent, retry-safe).
 */
export async function driveWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  drainMs = 50_000,
): Promise<DriveReport> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.writeFile("/workspace/.inspect-run.mjs", INSPECT_RUN_SCRIPT);
  const result = await sandbox.exec(
    `cd /workspace/repo && timeout ${Math.ceil(drainMs / 1000) + 10} node ${PI_WORKFLOW_CLI} supervise ${runId} --poll-ms 2000 --max-runtime-ms ${drainMs} >/dev/null 2>&1; ` +
      `node /workspace/.inspect-run.mjs ${runId}`,
    { timeout: drainMs + 45_000 },
  );
  const lastLine = result.stdout.trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`drive did not yield status: ${result.stdout.slice(-800)}`);
  }
}

/**
 * Escalation script: stop the run if needed, optionally fail a completed
 * stage (delegation) and promote its model in the compiled plan, then
 * resume — failed/interrupted tasks reset to pending and (via the spec's
 * invalidateOnDependencyResume) stale downstream stages re-run.
 */
const ESCALATE_RUN_SCRIPT = `
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
const [distDir, runId, failSpecId, toModel] = process.argv.slice(2);
const cwd = "/workspace/repo";
const engine = await import(pathToFileURL(path.join(distDir, "engine.js")).href);
const store = await import(pathToFileURL(path.join(distDir, "store.js")).href);
// 1. Make sure nothing is still executing (no-op / throws on terminal runs).
try { await engine.stopRun(cwd, runId); } catch {}
// 2. Delegation: mark the completed-but-underpowered stage failed so resume
//    re-runs it (and invalidates its dependents).
if (failSpecId !== "-") {
  await store.withRunLease(cwd, runId, async () => {
    const run = await store.readRunRecord(cwd, runId);
    const task = (run.tasks ?? []).find((t) => t.specId === failSpecId);
    if (task && task.status === "completed") {
      task.status = "failed";
      task.statusDetail = "delegated";
      task.lastMessage = "stage delegated for model promotion";
      await store.writeRunRecord(cwd, run);
    }
  });
}
// 3. Promotion: patch the stage's model in the compiled plan (launch reads
//    compiledTask.runtime.model).
if (toModel !== "-") {
  const compiledPath = path.join(cwd, ".pi/workflows", runId, "compiled.json");
  const compiled = JSON.parse(fs.readFileSync(compiledPath, "utf8"));
  for (const t of compiled.tasks ?? []) {
    if (failSpecId === "-" || (t.specId || t.id) === failSpecId) {
      t.runtime = { ...t.runtime, model: toModel };
    }
  }
  fs.writeFileSync(compiledPath, JSON.stringify(compiled));
}
// 4. Resume: failed/interrupted -> pending; supervise picks it back up.
const { resetTaskIds } = await engine.resumeRun(cwd, runId);
console.log(JSON.stringify({ ok: true, resetTaskIds }));
`;

/**
 * Mid-run steer: stop the run, append the operator's message to the CURRENT
 * stage's compiled prompt, and resume. pi-workflow has no live-injection
 * API, so interception = restart-the-stage-with-the-steer — upstream
 * artifacts intact (only the interrupted/failed stage re-runs; completed
 * stages keep their outputs).
 *
 * Mechanics this relies on (verified against @agwab/pi-workflow 0.9.0):
 * - stopRun interrupts the in-flight task (status "interrupted").
 * - resumeRun resets failed/interrupted tasks to pending.
 * - At (re)launch, subagent-backend writes task.md from
 *   compiledTask.compiledPrompt — so patching compiled.json re-prompts the
 *   stage. A pending-only run (steer landed between stages) has nothing to
 *   reset; resumeRun's complaint is ignored and the next supervise burst
 *   picks the patched prompt up anyway.
 */
const STEER_RUN_SCRIPT = `
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
const [distDir, runId, steerFile] = process.argv.slice(2);
const cwd = "/workspace/repo";
const steer = fs.readFileSync(steerFile, "utf8").trim();
const engine = await import(pathToFileURL(path.join(distDir, "engine.js")).href);
try { await engine.stopRun(cwd, runId); } catch {}
// Target = the CURRENT stage: first task not yet completed.
const runPath = path.join(cwd, ".pi/workflows", runId, "run.json");
const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
const target = (run.tasks ?? []).find((t) => t.status !== "completed");
if (!target) { console.log(JSON.stringify({ ok: false, reason: "no non-completed stage" })); process.exit(0); }
const specId = target.specId || target.taskId;
// Append the steer to the stage's compiled prompt (the relaunch source).
const compiledPath = path.join(cwd, ".pi/workflows", runId, "compiled.json");
const compiled = JSON.parse(fs.readFileSync(compiledPath, "utf8"));
const marker = "## Operator steering (mid-run";
for (const t of compiled.tasks ?? []) {
  if ((t.specId || t.id) !== specId) continue;
  t.compiledPrompt = (t.compiledPrompt ?? "") +
    "\\n\\n" + marker + " — read carefully)\\n\\n" +
    "A human operator interrupted this stage to redirect it. Their instructions " +
    "take precedence over conflicting parts of the original task above:\\n\\n" + steer + "\\n";
}
fs.writeFileSync(compiledPath, JSON.stringify(compiled));
// Resume: interrupted/failed -> pending. A pending-only run throws
// "No failed..." — fine, supervise picks it up.
let resetTaskIds = [];
try { ({ resetTaskIds } = await engine.resumeRun(cwd, runId)); } catch (e) {
  if (!/No failed/i.test(String(e?.message))) throw e;
}
console.log(JSON.stringify({ ok: true, stage: specId, resetTaskIds }));
`;

/**
 * Interrupt the run's current stage and re-run it with the operator's steer
 * appended to its prompt. Returns the steered stage's spec id.
 */
export async function steerWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  steer: string,
): Promise<string> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.writeFile("/workspace/.steer-run.mjs", STEER_RUN_SCRIPT);
  await sandbox.writeFile("/workspace/.steer-text", steer);
  const result = await sandbox.exec(
    `cd /workspace/repo && node /workspace/.steer-run.mjs ${PI_WORKFLOW_DIST} ${runId} /workspace/.steer-text`,
    { timeout: 120_000 },
  );
  const lastLine = result.stdout.trim().split("\n").at(-1) ?? "";
  try {
    const parsed = JSON.parse(lastLine) as { ok: boolean; stage?: string; reason?: string };
    if (!parsed.ok || !parsed.stage) throw new Error(parsed.reason ?? "steer not ok");
    return parsed.stage;
  } catch (err) {
    throw new Error(
      `steer failed: ${err instanceof Error ? err.message : err}: ${(result.stderr || result.stdout).slice(-500)}`,
    );
  }
}

/**
 * Restart the failed/delegated portion of a run. Options:
 * - failSpecId: a COMPLETED stage to re-run (delegation) — marked failed first.
 * - model: model override for the re-run stage (all non-matching stages keep
 *   theirs); with no failSpecId it applies to every stage in the plan.
 */
export async function escalateWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  options: { failSpecId?: string; model?: string } = {},
): Promise<string[]> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.writeFile("/workspace/.escalate-run.mjs", ESCALATE_RUN_SCRIPT);
  const result = await sandbox.exec(
    `cd /workspace/repo && node /workspace/.escalate-run.mjs ${PI_WORKFLOW_DIST} ${runId} ${options.failSpecId ?? "-"} ${options.model ?? "-"}`,
    { timeout: 120_000 },
  );
  const lastLine = result.stdout.trim().split("\n").at(-1) ?? "";
  try {
    const parsed = JSON.parse(lastLine) as { ok: boolean; resetTaskIds: string[] };
    if (!parsed.ok) throw new Error("escalate not ok");
    return parsed.resetTaskIds;
  } catch {
    throw new Error(
      `escalate failed: ${(result.stderr || result.stdout).slice(-800)}`,
    );
  }
}

/**
 * Collect the run's activity trail: per-task lifecycle events + subagent
 * event streams (tool calls, heartbeats) from the pi-workflow run records.
 * Returns a JSON string (rendered by the UI activity view).
 */
export async function collectActivity(
  env: Env,
  sandboxId: string,
  runId: string,
): Promise<string> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const script = `
const fs = require("fs"), path = require("path");
const repo = "/workspace/repo";
const out = { runId: ${JSON.stringify(runId)}, tasks: [] };
const readJsonl = (f, cap) => {
  try {
    const lines = fs.readFileSync(f, "utf8").trim().split("\\n");
    return lines.slice(-cap).map(l => { try { return JSON.parse(l); } catch { return { raw: l.slice(0, 300) }; } });
  } catch { return []; }
};
const wfDir = path.join(repo, ".pi/workflows", ${JSON.stringify(runId)});
let run = {};
try { run = JSON.parse(fs.readFileSync(path.join(wfDir, "run.json"), "utf8")); } catch {}
out.status = run.status;
out.usage = run.usage;
out.startedAt = run.startedAt; out.completedAt = run.completedAt;
const tasks = run.tasks ?? [];
// run.json tasks carry specId only; on-disk dirs are task-1, task-2, … in
// declaration order. Zip by index, but also fall back to dir enumeration.
const subWf = path.join(repo, ".pi/workflow-subagents", ${JSON.stringify(runId)});
let taskDirs = [];
try { taskDirs = fs.readdirSync(subWf).filter(d => d.startsWith("task-")).sort((a,b)=>Number(a.slice(5))-Number(b.slice(5))); } catch {}
taskDirs.forEach((dir, i) => {
  const t = tasks[i] ?? {};
  const task = { id: t.specId ?? dir, status: t.status ?? "unknown", startedAt: t.startedAt, completedAt: t.completedAt, events: [] };
  const subRoot = path.join(subWf, dir);
  try {
    for (const runDir of fs.readdirSync(subRoot)) {
      task.events.push(...readJsonl(path.join(subRoot, runDir, "events.jsonl"), 200));
    }
  } catch {}
  const read = (f, cap) => { try { return fs.readFileSync(f, "utf8").slice(-cap); } catch { return null; } };
  const tdir = path.join(wfDir, "tasks", dir);
  task.prompt = read(path.join(tdir, "task.md"), 4000);
  task.analysis = read(path.join(tdir, "analysis.md"), 6000);
  task.output = read(path.join(tdir, "output.log"), 4000);
  out.tasks.push(task);
});
console.log(JSON.stringify(out));
`;
  await sandbox.writeFile("/workspace/.collect-activity.cjs", script);
  const result = await sandbox.exec(`node /workspace/.collect-activity.cjs 2>/dev/null | head -c 900000`, {
    timeout: 60_000,
  });
  return result.exitCode === 0 && result.stdout.trim().startsWith("{")
    ? result.stdout.trim()
    : JSON.stringify({ runId, error: "activity unavailable", detail: result.stdout.slice(-300) });
}

/** Ensure the ticket branch exists locally (fresh sandbox after a park). */
export async function checkoutTicketBranch(
  env: Env,
  sandboxId: string,
  repo: string,
  branch: string,
  githubToken: string,
): Promise<void> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`not a github repo: ${repo}`);
  const authUrl = `https://x-access-token:${githubToken}@github.com/${m[1]}/${m[2]}.git`;
  const result = await sandbox.exec(
    [
      `cd /workspace/repo`,
      `git fetch ${JSON.stringify(authUrl)} ${branch}:refs/remotes/origin/${branch} 2>/dev/null || true`,
      `git checkout -B ${branch} origin/${branch} 2>/dev/null || git checkout -B ${branch}`,
    ].join(" && "),
    { timeout: 60_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`branch checkout failed: ${(result.stderr || result.stdout).slice(-400)}`);
  }
}

/**
 * Deliver the change set: commit on a ticket branch and push using the
 * Worker-held GitHub token (never persisted in the sandbox — used inline
 * in the push URL for a single command). Returns branch + full diff.
 */
export async function deliverBranch(
  env: Env,
  sandboxId: string,
  ticketId: string,
  repo: string,
  title: string,
): Promise<{ branch: string; diff: string; pushed: boolean }> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const branch = `workhorse/${ticketId}`;
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`not a github repo: ${repo}`);
  const pushUrl = `https://x-access-token:${env.GITHUB_TOKEN}@github.com/${m[1]}/${m[2]}.git`;

  const commit = await sandbox.exec(
    [
      `cd /workspace/repo`,
      `git checkout -B ${branch}`,
      `git add -A`,
      `git commit -m ${JSON.stringify(`${title} (workhorse ticket ${ticketId})`)} || true`,
      `git diff HEAD~1 --patch | head -c 200000`,
    ].join(" && "),
    { timeout: 60_000 },
  );
  if (commit.exitCode !== 0) {
    throw new Error(`commit failed: ${(commit.stderr || commit.stdout).slice(-500)}`);
  }
  const diff = commit.stdout.replace(/^.*?diff --git/s, "diff --git");

  const push = await sandbox.exec(
    `cd /workspace/repo && git push -f ${JSON.stringify(pushUrl)} ${branch}:${branch} 2>&1 | tail -3`,
    { timeout: 120_000 },
  );
  return { branch, diff, pushed: push.exitCode === 0 };
}

/** Collect the final artifacts: implement-stage analysis + the git diff stat. */
export async function collectResult(
  env: Env,
  sandboxId: string,
  runId: string,
): Promise<{ analysis: string; diffStat: string }> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const result = await sandbox.exec(
    [
      `cd /workspace/repo`,
      `git add -A`,
      `echo "===DIFF==="`,
      `git diff --cached --stat | tail -30`,
      `echo "===ANALYSIS==="`,
      // Read the LAST stage's analysis (fix stage in the 4-stage spec).
      `LAST=$(ls -d .pi/workflows/${runId}/tasks/task-* 2>/dev/null | sort -t- -k2 -n | tail -1)`,
      `tail -c 8000 "$LAST/analysis.md" 2>/dev/null || echo "(no analysis)"`,
    ].join(" && "),
    { timeout: 60_000 },
  );
  const [, rest = ""] = result.stdout.split("===DIFF===");
  const [diffStat = "", analysis = ""] = rest.split("===ANALYSIS===");
  return { analysis: analysis.trim(), diffStat: diffStat.trim() };
}
