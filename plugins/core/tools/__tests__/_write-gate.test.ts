// The write gate. This is the mechanism that makes a readOnly stage actually
// read-only, so the cases below are adversarial rather than illustrative.

import type { WritePolicy } from "@workhorse/api";
import { describe, expect, it } from "vitest";
import { blockedMessage, writeAllowed } from "../_write-gate";

const DIR = "/workspace/.workflow/r1/stages/implement/round-1";
const policy = (writeAllow: string[]): WritePolicy => ({ dir: DIR, writeAllow });

describe("no policy", () => {
  it("allows any path when the policy is absent", () => {
    // Absent means the surface has no stage (fleet chat), not "deny".
    expect(writeAllowed("/workspace/repo/src/app.ts", undefined)).toBe(true);
  });

  it("allows any path when the allowlist is empty", () => {
    // Empty means "no policy declared", which is open. A stage that wants to be
    // read-only must declare a policy that matches nothing — which is exactly
    // what agentSession does for readOnly agents.
    expect(writeAllowed("/workspace/repo/src/app.ts", policy([]))).toBe(true);
  });
});

describe("the stage's own directory", () => {
  it("is always writable, even under a restrictive policy", () => {
    // submit_work writes here. A policy that blocked it would make every stage
    // unable to finish.
    expect(writeAllowed(`${DIR}/control.json`, policy(["\u0000never"]))).toBe(true);
    expect(writeAllowed(`${DIR}/analysis.md`, policy(["src/**"]))).toBe(true);
  });

  it("does not extend to a sibling directory", () => {
    const sibling = "/workspace/.workflow/r1/stages/review/round-1/control.json";
    expect(writeAllowed(sibling, policy(["src/**"]))).toBe(false);
  });
});

describe("glob matching", () => {
  it("matches a repo-relative path against a repo-relative glob", () => {
    expect(writeAllowed("/workspace/repo/src/app.ts", policy(["src/**"]))).toBe(true);
  });

  it("matches an absolute glob", () => {
    expect(writeAllowed("/workspace/repo/src/app.ts", policy(["/workspace/repo/src/**"]))).toBe(true);
  });

  it("refuses a path outside every glob", () => {
    expect(writeAllowed("/workspace/repo/worker/index.ts", policy(["src/**"]))).toBe(false);
  });

  it("lets ** cross directory separators", () => {
    expect(writeAllowed("/workspace/repo/src/a/b/c.ts", policy(["src/**"]))).toBe(true);
  });

  it("does NOT let a single * cross a separator", () => {
    // The distinction matters: `src/*` should not grant `src/nested/deep.ts`.
    expect(writeAllowed("/workspace/repo/src/nested/deep.ts", policy(["src/*"]))).toBe(false);
    expect(writeAllowed("/workspace/repo/src/flat.ts", policy(["src/*"]))).toBe(true);
  });

  it("accepts any of several globs", () => {
    const p = policy(["src/**", "test/**"]);

    expect(writeAllowed("/workspace/repo/test/a.test.ts", p)).toBe(true);
    expect(writeAllowed("/workspace/repo/docs/a.md", p)).toBe(false);
  });

  it("treats a glob as anchored, not a substring", () => {
    // A substring match would let "evil-src/x.ts" through on a "src/**" policy.
    expect(writeAllowed("/workspace/repo/evil-src/x.ts", policy(["src/**"]))).toBe(false);
  });

  it("escapes regex metacharacters in a glob", () => {
    // A naive implementation turns "." into "any character", so "a.ts" would
    // match "axts" — and a glob containing "(" would throw.
    expect(writeAllowed("/workspace/repo/axts", policy(["a.ts"]))).toBe(false);
    expect(() => writeAllowed("/workspace/repo/x", policy(["a(b)c"]))).not.toThrow();
  });

  it("refuses everything under the readOnly sentinel policy", () => {
    const readOnly = policy(["\u0000never"]);

    expect(writeAllowed("/workspace/repo/src/app.ts", readOnly)).toBe(false);
    expect(writeAllowed("/workspace/repo/anything", readOnly)).toBe(false);
    expect(writeAllowed("/etc/passwd", readOnly)).toBe(false);
  });
});

describe("blockedMessage", () => {
  it("names the action, the path, and the declared policy", () => {
    const msg = blockedMessage("write", "/workspace/repo/x.ts", policy(["src/**"]));

    // The agent needs to know WHAT it hit, or it retries the same write.
    expect(msg).toContain("write blocked");
    expect(msg).toContain("/workspace/repo/x.ts");
    expect(msg).toContain("src/**");
  });

  it("says read-only when there is no allowlist to name", () => {
    expect(blockedMessage("edit", "/x", policy([]))).toContain("read-only");
    expect(blockedMessage("edit", "/x", undefined)).toContain("read-only");
  });
});
