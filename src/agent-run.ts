import { getSandbox } from "@cloudflare/sandbox";
import type { Env } from "./types";

const PI = "pi"; // /usr/local/bin/pi shim baked into the image
const PI_WORKFLOW_CLI =
  "/root/.pi/agent/npm/node_modules/@agwab/pi-workflow/src/cli.mjs";

/** Write the short-lived OAuth access token into the sandbox's Pi home. */
export async function injectAuth(env: Env, sandboxId: string, accessToken: string) {
  const sandbox = getSandbox(env.Sandbox, sandboxId);
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
 * Prepare the workspace: clone the repo, install the Workhorse workflow
 * bundle, and keep pi-workflow run artifacts out of the git diff.
 */
export async function prepareWorkspace(env: Env, sandboxId: string, repo: string) {
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const result = await sandbox.exec(
    [
      `[ -d /workspace/repo/.git ] || git clone --depth 50 ${JSON.stringify(repo)} /workspace/repo`,
      `cd /workspace/repo`,
      `mkdir -p .pi/workflows`,
      `cp -R /opt/agent/bundles/workflows/coding .pi/workflows/coding`,
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
  const sandbox = getSandbox(env.Sandbox, sandboxId);
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
 * Drive the workflow graph to completion with the supervisor.
 * Idempotent: safe to re-run after a step retry.
 */
export async function superviseWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  timeoutMs = 1_500_000,
): Promise<{ status: string; tasks: Array<{ id: string; status: string }> }> {
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const result = await sandbox.exec(
    `cd /workspace/repo && timeout ${Math.floor(timeoutMs / 1000)} node ${PI_WORKFLOW_CLI} supervise ${runId} --poll-ms 5000 2>&1 | tail -3; ` +
      `node -e "const r=require('/workspace/repo/.pi/workflows/${runId}/run.json'); console.log(JSON.stringify({status:r.status, tasks:(r.tasks||[]).map(t=>({id:t.specId||t.id,status:t.status}))}))"`,
    { timeout: timeoutMs + 60_000 },
  );
  const lastLine = result.stdout.trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`supervise did not yield status: ${result.stdout.slice(-800)}`);
  }
}

/** Collect the final artifacts: implement-stage analysis + the git diff stat. */
export async function collectResult(
  env: Env,
  sandboxId: string,
  runId: string,
): Promise<{ analysis: string; diffStat: string }> {
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const result = await sandbox.exec(
    [
      `cd /workspace/repo`,
      `git add -A`,
      `echo "===DIFF==="`,
      `git diff --cached --stat | tail -30`,
      `echo "===ANALYSIS==="`,
      `tail -c 8000 .pi/workflows/${runId}/tasks/task-2/analysis.md 2>/dev/null || echo "(no analysis)"`,
    ].join(" && "),
    { timeout: 60_000 },
  );
  const [, rest = ""] = result.stdout.split("===DIFF===");
  const [diffStat = "", analysis = ""] = rest.split("===ANALYSIS===");
  return { analysis: analysis.trim(), diffStat: diffStat.trim() };
}
