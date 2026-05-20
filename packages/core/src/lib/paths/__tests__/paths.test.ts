/**
 * Tests for path validation utilities.
 */

import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import { validatePath, isPathAllowed, assertPathAllowed, createPathValidator } from "../index.ts";

describe("validatePath", () => {
  const rootDir = "/test/worktree";

  it("allows paths within root directory", () => {
    const result = validatePath("./src/index.ts", { rootDir });
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(resolve(rootDir, "src/index.ts"));
  });

  it("allows absolute paths within root directory", () => {
    const result = validatePath("/test/worktree/src/index.ts", { rootDir });
    expect(result.valid).toBe(true);
  });

  it("allows nested paths within root directory", () => {
    const result = validatePath("./src/components/Button/index.tsx", { rootDir });
    expect(result.valid).toBe(true);
  });

  it("rejects paths outside root directory", () => {
    const result = validatePath("../other-worktree/file.ts", { rootDir });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("outside the allowed directory");
  });

  it("rejects absolute paths outside root directory", () => {
    const result = validatePath("/etc/passwd", { rootDir });
    expect(result.valid).toBe(false);
  });

  it("rejects path traversal attacks", () => {
    const result = validatePath("./src/../../../etc/passwd", { rootDir });
    expect(result.valid).toBe(false);
  });

  it("rejects hidden path traversal", () => {
    // Even if starts with valid path, traversal should be caught
    const result = validatePath("/test/worktree/src/../../other/file.ts", { rootDir });
    expect(result.valid).toBe(false);
  });

  it("allows root directory itself", () => {
    const result = validatePath(".", { rootDir });
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(resolve(rootDir));
  });

  describe("with additional allowed directories", () => {
    const options = {
      rootDir,
      additionalAllowedDirs: ["/tmp/workhorse-cache", "/var/cache"],
    };

    it("allows paths in additional directories", () => {
      const result = validatePath("/tmp/workhorse-cache/data.json", options);
      expect(result.valid).toBe(true);
    });

    it("allows nested paths in additional directories", () => {
      const result = validatePath("/var/cache/app/temp.txt", options);
      expect(result.valid).toBe(true);
    });

    it("still rejects paths outside all allowed directories", () => {
      const result = validatePath("/home/user/.ssh/id_rsa", options);
      expect(result.valid).toBe(false);
    });
  });
});

describe("isPathAllowed", () => {
  const rootDir = "/test/worktree";

  it("returns true for allowed paths", () => {
    expect(isPathAllowed("./src/index.ts", { rootDir })).toBe(true);
  });

  it("returns false for disallowed paths", () => {
    expect(isPathAllowed("../../../etc/passwd", { rootDir })).toBe(false);
  });
});

describe("assertPathAllowed", () => {
  const rootDir = "/test/worktree";

  it("returns normalized path for allowed paths", () => {
    const result = assertPathAllowed("./src/index.ts", { rootDir });
    expect(result).toBe(resolve(rootDir, "src/index.ts"));
  });

  it("throws for disallowed paths", () => {
    expect(() => assertPathAllowed("../../../etc/passwd", { rootDir })).toThrow(
      "outside the allowed directory",
    );
  });
});

describe("createPathValidator", () => {
  const rootDir = "/test/worktree";
  const validator = createPathValidator({ rootDir });

  it("creates a validator with bound options", () => {
    expect(validator.rootDir).toBe(rootDir);
  });

  it("validate() works correctly", () => {
    const result = validator.validate("./src/index.ts");
    expect(result.valid).toBe(true);
  });

  it("isAllowed() works correctly", () => {
    expect(validator.isAllowed("./src/index.ts")).toBe(true);
    expect(validator.isAllowed("../../../etc/passwd")).toBe(false);
  });

  it("assert() works correctly", () => {
    const result = validator.assert("./src/index.ts");
    expect(result).toBe(resolve(rootDir, "src/index.ts"));

    expect(() => validator.assert("../../../etc/passwd")).toThrow();
  });
});

describe("edge cases", () => {
  const rootDir = "/test/worktree";

  it("handles empty relative path", () => {
    const result = validatePath("", { rootDir });
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(resolve(rootDir));
  });

  it("handles paths with redundant separators", () => {
    const result = validatePath("./src//components///Button.tsx", { rootDir });
    expect(result.valid).toBe(true);
  });

  it("handles paths with dot segments", () => {
    const result = validatePath("./src/./components/./Button.tsx", { rootDir });
    expect(result.valid).toBe(true);
  });

  it("handles mixed traversal that stays in bounds", () => {
    // Goes up to src, then back into components - should be allowed
    const result = validatePath("./src/components/../utils/helper.ts", { rootDir });
    expect(result.valid).toBe(true);
    expect(result.normalizedPath).toBe(resolve(rootDir, "src/utils/helper.ts"));
  });
});
