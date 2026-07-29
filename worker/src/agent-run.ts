import { getSandbox } from "@cloudflare/sandbox";
import type { Driver } from "@workhorse/workflow";
import { db } from "./db";
import { validateScript } from "@workhorse/db";
import { repoSlug } from "@workhorse/knowledge";
import { parseScriptsToml } from "./scripts-toml";
import type { Env } from "@workhorse/api";

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


/** Write the short-lived OAuth access token into the sandbox's Pi home. */
export async function injectAuth(env: Env, sandboxId: string, accessToken: string) {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  const auth: Record<string, unknown> = {
    anthropic: {
      type: "oauth",
      access: accessToken,
      refresh: "",
      // Pi only checks expiry locally; real expiry is enforced server-side.
      expires: Date.now() + 4 * 3600 * 1000,
    },
  };
  // OpenCode free models as fallback when Anthropic rate limits.
  if (env.OPENCODE_API_KEY) {
    auth["opencode"] = { type: "api_key", key: env.OPENCODE_API_KEY };
  }
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
 * Write the imgup credentials file so `upload_image` can use imgbb — the
 * primary host for PR image embeds. imgup reads `~/.config/imgup/.env` on
 * Unix. No-ops when no key is configured, leaving the keyless fallback hosts
 * (imgbox/pixhost/catbox) as the chain.
 */
export async function injectImgupConfig(env: Env, sandboxId: string): Promise<void> {
  if (!env.IMGBB_KEY) return;
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
  await sandbox.exec("mkdir -p /root/.config/imgup", { timeout: 10_000 });
  await sandbox.writeFile("/root/.config/imgup/.env", `IMGBB_KEY=${env.IMGBB_KEY}\n`);
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


/**
 * Prepare the workspace: clone the repo, install the workflow, and keep
 * engine run artifacts out of the git diff.
 *
 * Workflows are USER DATA. Resolution order:
 *   1. repo's .workhorse/workflows/<name>/   (teams version their own)
 *   2. KV registry entry (workflow:<name>)   (fleet-wide, user-managed)
 *   3. baked /opt/agent/sandbox/workflows/   (seed fallback)
 */
/** Clone the repo and set up the workspace. Throws — a run cannot proceed without it. */
async function cloneRepo(env: Env, sandboxId: string, repo: string): Promise<void> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });

  const result = await sandbox.exec(
    [
      `[ -d /workspace/repo/.git ] || git clone --depth 50 ${JSON.stringify(repo)} /workspace/repo`,
      `cd /workspace/repo`,
      `mkdir -p .workflow`,
      // Keep run artifacts out of diffs and PRs without touching tracked files.
      `grep -q "^\\.workflow/$" .git/info/exclude 2>/dev/null || echo ".workflow/" >> .git/info/exclude`,
      `git config user.email "workhorse@stevenjohn.co" && git config user.name "Workhorse"`,
    ].join(" && "),
    { timeout: 180_000 },
  );

  if (result.exitCode !== 0) {
    throw new Error(`workspace prep failed: ${(result.stderr || result.stdout).slice(-500)}`);
  }
}

/** Register ONE script from a repo's scripts.toml. Returns why it was skipped, or null. */
async function seedScript(
  env: Env,
  scope: string,
  draft: ReturnType<typeof parseScriptsToml>[number],
): Promise<string | null> {
  const err = validateScript({ ...draft, scope });
  if (err) return err;

  const existing = await db(env).scripts.get(scope, draft.name);
  // A seed never clobbers an agent's or a user's own entry.
  if (existing && existing.createdBy !== "seed") return null;

  const now = new Date().toISOString();
  await db(env).scripts.upsert({
    scope,
    name: draft.name,
    description: draft.description ?? "",
    code: draft.code,
    args: draft.args ?? [],
    statusGates: draft.statusGates ?? [],
    createdBy: "seed",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  return null;
}

/**
 * Import a committed `.workhorse/scripts.toml` into the script registry as seeds —
 * clone-and-go, the same pattern as workflows.
 *
 * Non-fatal: a malformed file costs the repo its seeded scripts, not its run.
 */
async function seedScriptsFromRepo(env: Env, sandboxId: string, repo: string): Promise<void> {
  try {
    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "2m" });
    const read = await sandbox.exec(`cat /workspace/repo/.workhorse/scripts.toml 2>/dev/null || true`, {
      timeout: 10_000,
    });

    const toml = read.stdout?.trim();
    if (!toml) return;

    const scope = `repo:${repoSlug(repo)}`;
    for (const draft of parseScriptsToml(toml)) {
      const skipped = await seedScript(env, scope, draft);
      if (skipped) console.warn(`scripts.toml: skipped "${draft.name}": ${skipped}`);
    }
  } catch (err) {
    console.warn("scripts.toml seeding failed (non-fatal):", err);
  }
}

/** Clone the repo, then seed any scripts it ships. */
export async function prepareWorkspace(env: Env, sandboxId: string, repo: string): Promise<void> {
  await cloneRepo(env, sandboxId, repo);
  await seedScriptsFromRepo(env, sandboxId, repo);
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

