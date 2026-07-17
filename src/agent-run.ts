import { getSandbox } from "@cloudflare/sandbox";
import type { Env } from "./types";

const PI = "pi"; // /usr/local/bin/pi shim baked into the image
const PI_WORKFLOW_CLI =
  "/root/.pi/agent/npm/node_modules/@agwab/pi-workflow/src/cli.mjs";

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
export async function prepareWorkspace(env: Env, sandboxId: string, repo: string, model?: string) {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  // Evals: patch the model override into the workspace spec copy.
  const patchModel = model
    ? `node -e 'const f=".pi/workflows/coding/spec.json",s=require("/workspace/repo/"+f);s.defaults.model=${JSON.stringify(model)};require("fs").writeFileSync(f,JSON.stringify(s,null,2))'`
    : "true";
  const result = await sandbox.exec(
    [
      `[ -d /workspace/repo/.git ] || git clone --depth 50 ${JSON.stringify(repo)} /workspace/repo`,
      `cd /workspace/repo`,
      `mkdir -p .pi/workflows`,
      `cp -R /opt/agent/bundles/workflows/coding .pi/workflows/coding`,
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

/** Start the coding workflow for a task. Returns the pi-workflow run id. */
export async function startWorkflow(env: Env, sandboxId: string, task: string): Promise<string> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  // Write the slash command to a file to sidestep shell-quoting pitfalls.
  const slash = `/workflow run coding ${JSON.stringify(task)}`;
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
): Promise<{ status: string; tasks: Array<{ id: string; status: string }> }> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const result = await sandbox.exec(
    `cd /workspace/repo && timeout ${Math.ceil(drainMs / 1000) + 10} node ${PI_WORKFLOW_CLI} supervise ${runId} --poll-ms 2000 --max-runtime-ms ${drainMs} >/dev/null 2>&1; ` +
      `node -e "const r=require('/workspace/repo/.pi/workflows/${runId}/run.json'); console.log(JSON.stringify({status:r.status, tasks:(r.tasks||[]).map(t=>({id:t.specId||t.id,status:t.status}))}))"`,
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
