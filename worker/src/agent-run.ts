import { Buffer } from "node:buffer";
import { getSandbox } from "@cloudflare/sandbox";
import { WorkflowEngine, type Driver, type StageDriveReport, type WorkflowSpec } from "@workhorse/workflow";
import { parseScriptsToml } from "./scripts-toml";
import type { Env } from "@workhorse/api";

const PI = "pi"; // /usr/local/bin/pi shim baked into the image

/** Driver adapter: @workhorse/workflow's sandbox I/O over @cloudflare/sandbox. */
export function sandboxDriver(env: Env, sandboxId: string): Driver {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  return {
    async exec(command, opts) {
      const r = await sandbox.exec(command, { timeout: opts?.timeout ?? 60_000 });
      return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    writeFile: (path, content) => sandbox.writeFile(path, content).then(() => undefined),
    async readFile(path) {
      // sandbox.readFile throws on missing files; normalize to null.
      try {
        const r = await sandbox.readFile(path);
        return typeof r === "string" ? r : ((r as { content?: string })?.content ?? null);
      } catch {
        return null;
      }
    },
  };
}

/** Load the prepared workflow spec from the sandbox and build the engine. */
export async function engineFor(env: Env, sandboxId: string, workflow = "coding"): Promise<WorkflowEngine> {
  const wf = /^[\w-]+$/.test(workflow) ? workflow : "coding";
  const driver = sandboxDriver(env, sandboxId);
  const raw = await driver.readFile(`/workspace/repo/.pi/workflows/${wf}/spec.json`);
  if (!raw) throw new Error(`workflow "${wf}" spec not found in workspace (prepare first)`);
  const spec = JSON.parse(raw) as WorkflowSpec;
  // Inline schema files referenced by path (engine validates inline only).
  for (const stage of spec.artifactGraph.stages) {
    const ref = stage.output?.controlSchema;
    if (typeof ref === "string") {
      const schemaRaw = await driver.readFile(`/workspace/repo/.pi/workflows/${wf}/${ref.replace(/^\.\//, "")}`);
      if (schemaRaw) {
        try { stage.output!.controlSchema = JSON.parse(schemaRaw); } catch { delete stage.output!.controlSchema; }
      } else {
        delete stage.output!.controlSchema;
      }
    }
  }
  return new WorkflowEngine(driver, spec, { piBin: PI, cwd: "/workspace/repo" });
}

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

/**
 * Write ticket context for sandbox-half plugin tools: repo slug (script
 * scope resolution) + ticket id (live status gating via the registry).
 */
export async function injectTicketContext(
  env: Env,
  sandboxId: string,
  ticketId: string,
  repo: string,
): Promise<void> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.writeFile(
    "/root/.workhorse-ticket.json",
    JSON.stringify({ ticketId, repo: repoSlug(repo) }),
  );
}

// ---------------- dependency cache (R2 blob plane) ----------------
//
// Cold sandboxes (revision wakes, heals, repeat tickets on a known repo)
// rebuild node_modules from scratch. We tar the install artifacts after a
// successful run keyed by repo + lockfile hash, and restore at prepare.
// Transport: the sandbox curls the Worker's /depcache routes with the
// SCOPED token (already injected for browser/knowledge callbacks) — the
// sandbox never holds an R2 credential. Lockfile-hash keying makes
// staleness a non-problem: changed lockfile = miss = normal install.

const LOCKFILES = ["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

/** R2 object key for a dependency cache entry. */
export function depCacheKey(repo: string, hash: string): string {
  return `depcache/${repoSlug(repo)}/${hash}.tar.gz`;
}

/** In-sandbox: hash the first lockfile present (empty string = none). */
const HASH_CMD = `cd /workspace/repo && for f in ${LOCKFILES.join(" ")}; do [ -f "$f" ] && { sha256sum "$f" | cut -d' ' -f1; exit 0; }; done; echo ""`;

/**
 * Restore node_modules from the dependency cache. Returns "hit", "miss",
 * or "skip" (no lockfile / not configured). Never throws.
 */
export async function restoreDepCache(env: Env, sandboxId: string, repo: string): Promise<string> {
  try {
    if (!env.SELF_URL || !env.BROWSER_TOKEN) return "skip";
    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
    const h = await sandbox.exec(HASH_CMD, { timeout: 30_000 });
    const hash = h.stdout.trim().split("\n").pop() ?? "";
    if (h.exitCode !== 0 || !/^[a-f0-9]{64}$/.test(hash)) return "skip";
    // Already installed (warm sandbox)? Don't clobber.
    const warm = await sandbox.exec(`[ -d /workspace/repo/node_modules ] && echo warm || echo cold`, {
      timeout: 10_000,
    });
    if (warm.stdout.includes("warm")) return "skip";
    const url = `${env.SELF_URL}/depcache?repo=${encodeURIComponent(repoSlug(repo))}&hash=${hash}`;
    const res = await sandbox.exec(
      `cd /workspace/repo && curl -sf -H "authorization: Bearer ${env.BROWSER_TOKEN}" ${JSON.stringify(url)} -o /tmp/depcache.tgz && tar -xzf /tmp/depcache.tgz && rm -f /tmp/depcache.tgz && echo RESTORED || { rm -f /tmp/depcache.tgz; echo MISS; }`,
      { timeout: 300_000 },
    );
    return res.stdout.includes("RESTORED") ? "hit" : "miss";
  } catch (err) {
    console.warn("depcache restore failed (non-fatal):", err);
    return "skip";
  }
}

/**
 * Save the dependency artifacts to the cache after a successful run.
 * Skips when the exact key already exists (immutable by content hash).
 * Never throws.
 */
export async function saveDepCache(env: Env, sandboxId: string, repo: string): Promise<boolean> {
  try {
    if (!env.SELF_URL || !env.BROWSER_TOKEN) return false;
    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
    const h = await sandbox.exec(HASH_CMD, { timeout: 30_000 });
    const hash = h.stdout.trim().split("\n").pop() ?? "";
    if (h.exitCode !== 0 || !/^[a-f0-9]{64}$/.test(hash)) return false;
    // Content-addressed: if the key exists, the exact artifact exists.
    if (await env.BLOBS.head(depCacheKey(repo, hash))) return false;
    const url = `${env.SELF_URL}/depcache?repo=${encodeURIComponent(repoSlug(repo))}&hash=${hash}`;
    const res = await sandbox.exec(
      // node_modules only (the dominant cost, uniformly located); cap ~400MB
      // compressed — beyond that the round-trip stops paying for itself.
      `cd /workspace/repo && [ -d node_modules ] || { echo NONE; exit 0; }; tar -czf /tmp/depcache.tgz node_modules && [ "$(stat -c%s /tmp/depcache.tgz)" -le 419430400 ] && curl -sf -X PUT -H "authorization: Bearer ${env.BROWSER_TOKEN}" --data-binary @/tmp/depcache.tgz ${JSON.stringify(url)} && echo SAVED; rm -f /tmp/depcache.tgz`,
      { timeout: 600_000 },
    );
    return res.stdout.includes("SAVED");
  } catch (err) {
    console.warn("depcache save failed (non-fatal):", err);
    return false;
  }
}

const MC_DIR = "/root/.local/share/cortexkit/magic-context";
const MC_DB = `${MC_DIR}/context.db`;
/** Sanity ceiling for a repo memory db in R2 (not a KV cap — just abuse guard). */
const MC_MAX_BYTES = 512 * 1024 * 1024;

/** Stable per-repo slug for blob keys. */
function repoSlug(repo: string): string {
  const m = repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return m ? `${m[1]}/${m[2]}` : repo.replace(/[^a-zA-Z0-9_/-]/g, "_");
}

/** R2 object key for a repo's Magic Context db. */
function memoryBlobKey(repo: string): string {
  return `mc/${repoSlug(repo)}.db`;
}

/** Legacy KV key (pre-R2) — read-only fallback for repos not yet migrated. */
function memoryKVKey(repo: string): string {
  return `mc:${repoSlug(repo)}`;
}

/**
 * Restore the repo's Magic Context database into the sandbox so the agent
 * starts with the fleet's accumulated memories for this repo. Memories are
 * keyed to stable project identity (git root commit hash), so the same repo
 * resolves to the same memories in every sandbox.
 */
export async function restoreMemory(env: Env, sandboxId: string, repo: string): Promise<boolean> {
  // R2 is authoritative; legacy KV is a read-only fallback for repos whose
  // memory predates the blob plane (next persist moves them to R2).
  let b64: string | null = null;
  const obj = await env.BLOBS.get(memoryBlobKey(repo));
  if (obj) {
    b64 = Buffer.from(await obj.arrayBuffer()).toString("base64");
  } else {
    b64 = await env.TICKETS.get(memoryKVKey(repo));
  }
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
 * Persist the sandbox's Magic Context database to R2 (WAL-checkpointed via
 * node:sqlite, base64 over the exec channel, stored as raw bytes). No KV
 * size ceiling anymore — the old 25 MiB cap silently dropped memories on
 * chatty repos. Never throws — memory persistence must not fail a ticket.
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
      console.warn(`MC db for ${repo} exceeds sanity ceiling; skipping persist`);
      return false;
    }
    const b64 = res.stdout.trim();
    if (res.exitCode !== 0 || b64.length < 100) return false;
    await env.BLOBS.put(memoryBlobKey(repo), Buffer.from(b64, "base64"));
    // Retire the legacy KV copy so future restores can't resurrect stale state.
    await env.TICKETS.delete(memoryKVKey(repo));
    return true;
  } catch (err) {
    console.warn(`MC persist failed for ${repo}:`, err);
    return false;
  }
}

/**
 * Prepare the workspace: clone the repo, install the workflow, and keep
 * engine run artifacts out of the git diff.
 *
 * Workflows are USER DATA. Resolution order:
 *   1. repo's .workhorse/workflows/<name>/   (teams version their own)
 *   2. KV registry entry (workflow:<name>)   (fleet-wide, user-managed)
 *   3. baked /opt/agent/sandbox/workflows/   (seed fallback)
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
  const result = await sandbox.exec(
    [
      `[ -d /workspace/repo/.git ] || git clone --depth 50 ${JSON.stringify(repo)} /workspace/repo`,
      `cd /workspace/repo`,
      `mkdir -p .pi/workflows`,
      // Tier 1/3: repo-versioned workflow wins; baked bundle is the fallback.
      // (A registry entry, when present, overwrites this copy below.)
      `if [ -d .workhorse/workflows/${wf} ]; then cp -R .workhorse/workflows/${wf} .pi/workflows/${wf}; ` +
        `elif [ -d /opt/agent/sandbox/workflows/${wf} ]; then cp -R /opt/agent/sandbox/workflows/${wf} .pi/workflows/${wf}; ` +
        `else mkdir -p .pi/workflows/${wf}; fi`,
      `[ -d .workhorse/workflows/${wf} ] && echo WH_SRC=repo || echo WH_SRC=other`,
      // Keep run artifacts out of diffs/PRs without touching tracked files.
      `grep -q "^\\.pi/$" .git/info/exclude 2>/dev/null || echo ".pi/" >> .git/info/exclude`,
      `git config user.email "workhorse@stevenjohn.co" && git config user.name "Workhorse"`,
    ].join(" && "),
    { timeout: 180_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`workspace prep failed: ${(result.stderr || result.stdout).slice(-500)}`);
  }

  // Tier 2: KV registry entry — unless the repo versions its own (tier 1).
  if (!result.stdout.includes("WH_SRC=repo")) {
    const { getWorkflow } = await import("./workflows");
    const entry = await getWorkflow(env, wf);
    if (entry) {
      const dir = `/workspace/repo/.pi/workflows/${wf}`;
      await sandbox.writeFile(`${dir}/spec.json`, JSON.stringify(entry.spec, null, 2));
      for (const [rel, text] of Object.entries(entry.schemas ?? {})) {
        if (!/^[\w./-]+$/.test(rel) || rel.includes("..")) continue;
        await sandbox.writeFile(`${dir}/${rel}`, text);
      }
      for (const [file, md] of Object.entries(entry.agents ?? {})) {
        if (!/^[\w.-]+\.md$/.test(file)) continue;
        await sandbox.writeFile(`/root/.pi/agent/agents/${file}`, md);
      }
    }
  }

  // Sanity: SOME spec must exist now (an unknown name with no registry
  // entry would otherwise fail at dispatch).
  const check = await sandbox.exec(`test -f /workspace/repo/.pi/workflows/${wf}/spec.json`, {
    timeout: 10_000,
  });
  if (check.exitCode !== 0) {
    throw new Error(`workflow "${wf}" not found in repo, registry, or baked bundles`);
  }

  // Script seeding: a committed .workhorse/scripts.toml imports into the
  // registry (created_by: seed) — clone-and-go, same pattern as workflows.
  // Parsed sandbox-side with a tiny tolerant reader (name/description/
  // command/args/status_gates per [[script]] block), registered via db.
  try {
    const tomlRead = await sandbox.exec(
      `cat /workspace/repo/.workhorse/scripts.toml 2>/dev/null || true`,
      { timeout: 10_000 },
    );
    const toml = tomlRead.stdout?.trim();
    if (toml) {
      const { validateScript, upsertScript, getScript } = await import("./db");
      const now = new Date().toISOString();
      for (const s of parseScriptsToml(toml)) {
        const scope = `repo:${repoSlug(repo)}`;
        const err = validateScript({ ...s, scope });
        if (err) {
          console.warn(`scripts.toml: skipped "${s.name}": ${err}`);
          continue;
        }
        const existing = await getScript(env, scope, s.name);
        // Seeds never clobber agent/user entries.
        if (existing && existing.createdBy !== "seed") continue;
        await upsertScript(env, {
          scope,
          name: s.name,
          description: s.description ?? "",
          command: s.command,
          args: s.args ?? [],
          statusGates: s.statusGates ?? [],
          createdBy: "seed",
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn("scripts.toml seeding failed (non-fatal):", err);
  }

  // Evals: patch the model override into the workspace spec copy.
  if (model) {
    const patch = await sandbox.exec(
      `cd /workspace/repo && node -e 'const f=".pi/workflows/${wf}/spec.json",s=require("/workspace/repo/"+f);s.defaults=s.defaults??{};s.defaults.model=${JSON.stringify(model)};require("fs").writeFileSync(f,JSON.stringify(s,null,2))'`,
      { timeout: 30_000 },
    );
    if (patch.exitCode !== 0) {
      throw new Error(`model patch failed: ${(patch.stderr || patch.stdout).slice(-300)}`);
    }
  }
}

/** Dispatch the named workflow for a task. Returns the run id. */
export async function startWorkflow(
  env: Env,
  sandboxId: string,
  task: string,
  workflow = "coding",
  inputs?: Record<string, string | number | boolean>,
): Promise<string> {
  const engine = await engineFor(env, sandboxId, workflow);
  const state = await engine.dispatch(task, inputs ? { inputs } : {});
  return state.runId;
}

export type DriveReport = StageDriveReport;

/**
 * Drive the run forward for one burst (~drainMs) and report status —
 * engine.advance reconciles the running session, launches ready stages,
 * and holds the burst polling the live session.
 */
export async function driveWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  drainMs = 50_000,
  workflow = "coding",
): Promise<DriveReport> {
  const engine = await engineFor(env, sandboxId, workflow);
  return engine.advance(runId, drainMs);
}

/**
 * Interrupt the run's current stage and re-run it with the operator's steer
 * appended to its prompt. Returns the steered stage's id.
 */
export async function steerWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  steer: string,
  workflow = "coding",
): Promise<string> {
  const engine = await engineFor(env, sandboxId, workflow);
  return engine.steer(runId, steer);
}

/**
 * Escalate the run:
 * - failSpecId + model → capability promotion (re-run that stage one model up).
 * - model only → availability fallback (failed + remaining stages move to it).
 * - neither → plain retry of failed stages (fresh credentials already injected).
 */
export async function escalateWorkflow(
  env: Env,
  sandboxId: string,
  runId: string,
  options: { failSpecId?: string; model?: string } = {},
  workflow = "coding",
): Promise<string[]> {
  const engine = await engineFor(env, sandboxId, workflow);
  if (options.model) return engine.promote(runId, options.model, options.failSpecId);
  return engine.retry(runId);
}

/**
 * Collect the run's activity document (per-stage lifecycle, prompts,
 * analyses, session log tails) for the UI + trace archive.
 */
export async function collectActivity(
  env: Env,
  sandboxId: string,
  runId: string,
  workflow = "coding",
): Promise<string> {
  try {
    const engine = await engineFor(env, sandboxId, workflow);
    return JSON.stringify(await engine.activity(runId));
  } catch (err) {
    return JSON.stringify({ runId, error: "activity unavailable", detail: String(err).slice(0, 300) });
  }
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

/** Collect the final artifacts: terminal-stage analysis + the git diff stat. */
export async function collectResult(
  env: Env,
  sandboxId: string,
  runId: string,
  workflow = "coding",
): Promise<{ analysis: string; diffStat: string }> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const diff = await sandbox.exec(
    `cd /workspace/repo && git add -A && git diff --cached --stat | tail -30`,
    { timeout: 60_000 },
  );
  let analysis = "";
  try {
    const engine = await engineFor(env, sandboxId, workflow);
    analysis = (await engine.collect(runId)).analysis;
  } catch {
    /* leave empty */
  }
  return { analysis: analysis.trim(), diffStat: (diff.stdout ?? "").trim() };
}
