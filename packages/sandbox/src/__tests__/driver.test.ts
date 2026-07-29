// Sandbox preparation and the dependency cache.
//
// agent-run.ts had no tests at all, which is why every function fallow flagged
// here scored `cyc² + cyc` exactly. These are the paths that decide whether a run
// starts with a working workspace — and every one of them is best-effort, which is
// the shape where a silent failure goes unnoticed for weeks.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ExecResult = { exitCode: number; stdout: string; stderr: string };

const exec = vi.fn<(cmd: string, opts?: { timeout?: number }) => Promise<ExecResult>>();
const writeFile = vi.fn(async () => {});
const scriptsGet = vi.fn<() => Promise<unknown>>(async () => null);
const scriptsUpsert = vi.fn();

const readFile = vi.fn<(path: string) => Promise<unknown>>();

vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({ exec, writeFile, readFile }) }));
vi.mock("@workhorse/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workhorse/db")>()),
  db: () => ({ scripts: { get: scriptsGet, upsert: scriptsUpsert } }),
}));

const { depCacheKey, injectTicketContext, prepareWorkspace, restoreDepCache, sandboxDriver, saveDepCache } =
  await import("../driver");

const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "" });
const fail = (stderr = "boom"): ExecResult => ({ exitCode: 1, stdout: "", stderr });
const HASH = "a".repeat(64);

/** @param cached whether the depcache key already exists in R2 */
const env = (cached = false) =>
  fakeEnv({
    SELF_URL: "https://workhorse.test",
    BROWSER_TOKEN: "scoped-token",
    // Supplied up front: fakeEnv wraps an unstubbed binding in a Proxy whose get
    // trap returns a throwing function, so assigning .head afterwards is silently
    // ignored — the trap still answers the call.
    BLOBS: { head: async () => (cached ? { key: "exists" } : null) },
  });

beforeEach(() => {
  vi.clearAllMocks();
  scriptsGet.mockResolvedValue(null);
  exec.mockResolvedValue(ok());
});

describe("sandboxDriver", () => {
  const driver = () => sandboxDriver(env(), "s1");

  it("defaults the exec timeout when none is given", async () => {
    await driver().exec("ls");
    expect(exec.mock.calls[0][1]).toEqual({ timeout: 60_000 });
  });

  it("honours an explicit timeout", async () => {
    await driver().exec("build", { timeout: 300_000 });
    expect(exec.mock.calls[0][1]).toEqual({ timeout: 300_000 });
  });

  it("normalizes missing stdout/stderr to empty strings", async () => {
    exec.mockResolvedValue({ exitCode: 0 } as never);

    // The workflow driver contract is string, not string | undefined — a stage
    // doing output.includes() on undefined would throw.
    expect(await driver().exec("ls")).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("reads a file returned as a plain string", async () => {
    readFile.mockResolvedValue("contents");
    expect(await driver().readFile("/a")).toBe("contents");
  });

  it("reads a file returned as an object with content", async () => {
    readFile.mockResolvedValue({ content: "contents" });
    expect(await driver().readFile("/a")).toBe("contents");
  });

  it("returns null for a MISSING file instead of throwing", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"));

    // sandbox.readFile throws on absence; the driver contract is null, and every
    // caller branches on that.
    expect(await driver().readFile("/nope")).toBeNull();
  });

  it("returns null for an unrecognized response shape", async () => {
    readFile.mockResolvedValue({ unexpected: true });
    expect(await driver().readFile("/a")).toBeNull();
  });

  it("resolves writeFile to undefined", async () => {
    expect(await driver().writeFile("/a", "x")).toBeUndefined();
  });
});

describe("depCacheKey", () => {
  it("is content-addressed by repo and lockfile hash", () => {
    expect(depCacheKey("https://github.com/acme/widgets.git", HASH)).toBe(`depcache/acme/widgets/${HASH}.tar.gz`);
  });

  it("normalizes clone-URL spellings to one key", () => {
    // Otherwise the same repo would miss its own cache depending on how the URL
    // was written.
    expect(depCacheKey("git@github.com:acme/widgets.git", HASH)).toBe(depCacheKey("https://github.com/acme/widgets", HASH));
  });
});

describe("prepareWorkspace", () => {
  it("clones the repo and configures git identity", async () => {
    await prepareWorkspace(env(), "s1", "https://github.com/acme/widgets.git");

    const clone = exec.mock.calls[0][0];
    expect(clone).toContain("git clone --depth 50");
    expect(clone).toContain("git config user.name");
  });

  it("excludes the run artifact dir from diffs without touching tracked files", async () => {
    await prepareWorkspace(env(), "s1", "acme/widgets");

    // .git/info/exclude, not .gitignore: a PR must not carry our bookkeeping.
    expect(exec.mock.calls[0][0]).toContain(".git/info/exclude");
  });

  it("THROWS when the clone fails", async () => {
    exec.mockResolvedValue(fail("repository not found"));

    // The only fatal step here: nothing downstream can work without a workspace.
    await expect(prepareWorkspace(env(), "s1", "acme/nope")).rejects.toThrow(/workspace prep failed/);
  });

  it("does not attempt script seeding when the clone failed", async () => {
    exec.mockResolvedValue(fail());
    await prepareWorkspace(env(), "s1", "acme/nope").catch(() => {});

    expect(scriptsUpsert).not.toHaveBeenCalled();
  });

  it("seeds a script from a committed scripts.toml", async () => {
    exec.mockImplementation(async (cmd) =>
      cmd.includes("scripts.toml")
        ? ok('[[script]]\nname = "run_tests"\ndescription = "run the suite"\ncode = "return 1;"\n')
        : ok(),
    );

    await prepareWorkspace(env(), "s1", "acme/widgets");

    expect(scriptsUpsert).toHaveBeenCalledTimes(1);
    expect(scriptsUpsert.mock.calls[0][0]).toMatchObject({ name: "run_tests", scope: "repo:acme/widgets", createdBy: "seed" });
  });

  it("does NOT clobber an agent's own script of the same name", async () => {
    scriptsGet.mockResolvedValue({ name: "run_tests", createdBy: "agent" });
    exec.mockImplementation(async (cmd) =>
      cmd.includes("scripts.toml") ? ok('[[script]]\nname = "run_tests"\ncode = "return 1;"\n') : ok(),
    );

    await prepareWorkspace(env(), "s1", "acme/widgets");

    // A repo's seed file must not silently overwrite what an agent learned to
    // write for itself.
    expect(scriptsUpsert).not.toHaveBeenCalled();
  });

  it("replaces an existing SEED, preserving its createdAt", async () => {
    scriptsGet.mockResolvedValue({ name: "run_tests", createdBy: "seed", createdAt: "2026-01-01T00:00:00.000Z" });
    exec.mockImplementation(async (cmd) =>
      cmd.includes("scripts.toml") ? ok('[[script]]\nname = "run_tests"\ncode = "return 2;"\n') : ok(),
    );

    await prepareWorkspace(env(), "s1", "acme/widgets");

    expect(scriptsUpsert.mock.calls[0][0]).toMatchObject({ createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("skips an invalid script but keeps going", async () => {
    exec.mockImplementation(async (cmd) =>
      cmd.includes("scripts.toml")
        ? ok('[[script]]\nname = "Bad Name"\ncode = "x"\n\n[[script]]\nname = "good_one"\ncode = "return 1;"\n')
        : ok(),
    );

    await prepareWorkspace(env(), "s1", "acme/widgets");

    // One malformed entry must not cost the repo its other scripts.
    expect(scriptsUpsert).toHaveBeenCalledTimes(1);
    expect(scriptsUpsert.mock.calls[0][0]).toMatchObject({ name: "good_one" });
  });

  it("is a no-op when the repo ships no scripts.toml", async () => {
    await prepareWorkspace(env(), "s1", "acme/widgets");
    expect(scriptsUpsert).not.toHaveBeenCalled();
  });

  it("does not fail the run when seeding throws", async () => {
    exec.mockImplementation(async (cmd) => {
      if (cmd.includes("scripts.toml")) throw new Error("sandbox died");
      return ok();
    });

    // Seeding is a convenience; the clone already succeeded.
    await expect(prepareWorkspace(env(), "s1", "acme/widgets")).resolves.toBeUndefined();
  });
});

describe("restoreDepCache", () => {
  it("skips when the scoped callback is not configured", async () => {
    // Without SELF_URL/BROWSER_TOKEN the sandbox cannot reach the depcache route
    // at all — and it must never be given an R2 credential instead.
    expect(await restoreDepCache(fakeEnv({ SELF_URL: undefined }), "s1", "acme/widgets")).toBe("skip");
    expect(exec).not.toHaveBeenCalled();
  });

  it("skips a repo with no lockfile", async () => {
    exec.mockResolvedValue(ok(""));
    expect(await restoreDepCache(env(), "s1", "acme/widgets")).toBe("skip");
  });

  it("skips when the hash is not a sha256", async () => {
    exec.mockResolvedValue(ok("not-a-hash"));
    expect(await restoreDepCache(env(), "s1", "acme/widgets")).toBe("skip");
  });

  it("skips a WARM sandbox rather than clobbering node_modules", async () => {
    exec.mockImplementation(async (cmd) => (cmd.includes("node_modules") ? ok("warm") : ok(HASH)));

    expect(await restoreDepCache(env(), "s1", "acme/widgets")).toBe("skip");
  });

  it("reports a hit when the archive restored", async () => {
    exec.mockImplementation(async (cmd) => {
      if (cmd.includes("sha256sum")) return ok(HASH);
      if (cmd.includes("&& echo warm")) return ok("cold");
      return ok("RESTORED");
    });

    expect(await restoreDepCache(env(), "s1", "acme/widgets")).toBe("hit");
  });

  it("reports a miss when there is no cached archive", async () => {
    exec.mockImplementation(async (cmd) => {
      if (cmd.includes("sha256sum")) return ok(HASH);
      if (cmd.includes("&& echo warm")) return ok("cold");
      return ok("MISS");
    });

    expect(await restoreDepCache(env(), "s1", "acme/widgets")).toBe("miss");
  });

  it("sends the SCOPED token, never the master one", async () => {
    exec.mockImplementation(async (cmd) => {
      if (cmd.includes("sha256sum")) return ok(HASH);
      if (cmd.includes("&& echo warm")) return ok("cold");
      return ok("RESTORED");
    });

    await restoreDepCache(env(), "s1", "acme/widgets");

    const curl = exec.mock.calls.at(-1)?.[0] ?? "";
    expect(curl).toContain("Bearer scoped-token");
    expect(curl).not.toContain("test-spike-token");
  });

  it("skips rather than throwing when the sandbox dies", async () => {
    exec.mockRejectedValue(new Error("container gone"));
    expect(await restoreDepCache(env(), "s1", "acme/widgets")).toBe("skip");
  });
});

describe("saveDepCache", () => {
  it("returns false when the callback is not configured", async () => {
    expect(await saveDepCache(fakeEnv({ BROWSER_TOKEN: undefined }), "s1", "acme/widgets")).toBe(false);
  });

  it("returns false with no lockfile", async () => {
    exec.mockResolvedValue(ok(""));
    expect(await saveDepCache(env(), "s1", "acme/widgets")).toBe(false);
  });

  it("skips the upload when the exact key already exists", async () => {
    const e = env(true);
    exec.mockResolvedValue(ok(HASH));

    // Content-addressed: the key existing means the identical artifact exists, so
    // re-uploading would spend a 400MB round-trip for nothing.
    expect(await saveDepCache(e, "s1", "acme/widgets")).toBe(false);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("reports success when the archive uploaded", async () => {
    const e = env();
    exec.mockImplementation(async (cmd) => (cmd.includes("sha256sum") ? ok(HASH) : ok("SAVED")));

    expect(await saveDepCache(e, "s1", "acme/widgets")).toBe(true);
  });

  it("reports failure when there is no node_modules to save", async () => {
    const e = env();
    exec.mockImplementation(async (cmd) => (cmd.includes("sha256sum") ? ok(HASH) : ok("NONE")));

    expect(await saveDepCache(e, "s1", "acme/widgets")).toBe(false);
  });

  it("caps the archive size", async () => {
    const e = env();
    exec.mockImplementation(async (cmd) => (cmd.includes("sha256sum") ? ok(HASH) : ok("SAVED")));

    await saveDepCache(e, "s1", "acme/widgets");

    // Past ~400MB compressed the round-trip stops paying for itself.
    expect(exec.mock.calls.at(-1)?.[0]).toContain("419430400");
  });

  it("returns false rather than throwing when the sandbox dies", async () => {
    exec.mockRejectedValue(new Error("container gone"));
    expect(await saveDepCache(env(), "s1", "acme/widgets")).toBe(false);
  });
});

describe("injectTicketContext", () => {
  it("writes the ticket id and NORMALIZED repo into the sandbox", async () => {
    await injectTicketContext(env(), "s1", "t1", "git@github.com:acme/widgets.git");

    const [path, body] = writeFile.mock.calls[0] as unknown as [string, string];
    expect(path).toBe("/root/.workhorse-ticket.json");
    expect(JSON.parse(body)).toEqual({ ticketId: "t1", repo: "acme/widgets" });
  });
});
