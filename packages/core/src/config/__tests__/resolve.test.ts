import { homedir } from "node:os";
import { join } from "node:path";

describe("resolveConfigPaths", () => {
  it("resolves paths with repoRoot", async () => {
    const { resolveConfigPaths } = await import("../resolve.ts");

    const paths = resolveConfigPaths("/some/repo");

    expect(paths.projectConfig).toBe("/some/repo/.workhorse.toml");
    expect(paths.globalDir).toContain("workhorse");
    expect(paths.database).toContain("workhorse.db");
    expect(paths.memoryDatabase).toContain("memory.db");
    expect(paths.attachmentsDir).toContain("attachments");
  });

  it("defaults projectConfig to cwd when no repoRoot provided", async () => {
    const { resolveConfigPaths } = await import("../resolve.ts");

    const paths = resolveConfigPaths();

    expect(paths.projectConfig).toBe(join(process.cwd(), ".workhorse.toml"));
  });

  it("respects XDG_DATA_HOME", async () => {
    const originalXdgData = process.env["XDG_DATA_HOME"];
    process.env["XDG_DATA_HOME"] = "/custom/data";

    try {
      // Re-import to pick up env change
      const { resolveConfigPaths } = await import("../resolve.ts");
      const paths = resolveConfigPaths();

      expect(paths.globalDir).toBe("/custom/data/workhorse");
      expect(paths.database).toBe("/custom/data/workhorse/workhorse.db");
      expect(paths.attachmentsDir).toBe("/custom/data/workhorse/attachments");
    } finally {
      if (originalXdgData) {
        process.env["XDG_DATA_HOME"] = originalXdgData;
      } else {
        delete process.env["XDG_DATA_HOME"];
      }
    }
  });

  it("uses default paths when XDG vars not set", async () => {
    const originalXdgData = process.env["XDG_DATA_HOME"];
    const originalXdgConfig = process.env["XDG_CONFIG_HOME"];
    delete process.env["XDG_DATA_HOME"];
    delete process.env["XDG_CONFIG_HOME"];

    try {
      const { resolveConfigPaths } = await import("../resolve.ts");
      const paths = resolveConfigPaths();

      expect(paths.globalDir).toBe(join(homedir(), ".local", "share", "workhorse"));
    } finally {
      if (originalXdgData) process.env["XDG_DATA_HOME"] = originalXdgData;
      if (originalXdgConfig) process.env["XDG_CONFIG_HOME"] = originalXdgConfig;
    }
  });

  it("constructs worktreesRoot from repoRoot", async () => {
    const { resolveConfigPaths } = await import("../resolve.ts");
    const paths = resolveConfigPaths("/my/project");

    expect(paths.worktreesRoot).toBe("/my/project-worktrees");
  });

  it("handles repoRoot with trailing slash", async () => {
    const { resolveConfigPaths } = await import("../resolve.ts");
    const paths = resolveConfigPaths("/my/project/");

    expect(paths.projectConfig).toBe("/my/project/.workhorse.toml");
  });

  it.fails("TODO: resolveConfigPaths should validate repoRoot exists", async () => {
    // Currently resolveConfigPaths doesn't check if the provided repoRoot
    // actually exists on the filesystem. Future enhancement: validate and
    // throw a meaningful error.
    const { resolveConfigPaths } = await import("../resolve.ts");

    expect(() => resolveConfigPaths("/nonexistent/repo/path/xyz123")).toThrow();
  });
});
