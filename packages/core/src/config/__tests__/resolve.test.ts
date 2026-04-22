import { join } from "node:path";
import { homedir } from "node:os";

describe("resolveConfigPaths", () => {
  it("resolves paths with repoRoot", async () => {
    const { resolveConfigPaths } = await import("../resolve.ts");

    const paths = resolveConfigPaths("/some/repo");

    expect(paths.projectConfig).toBe("/some/repo/.jiratown.toml");
    expect(paths.globalDir).toContain("jiratown");
    expect(paths.database).toContain("jiratown.db");
    expect(paths.memoryDatabase).toContain("memory.db");
  });

  it("defaults projectConfig to cwd when no repoRoot provided", async () => {
    const { resolveConfigPaths } = await import("../resolve.ts");

    const paths = resolveConfigPaths();

    expect(paths.projectConfig).toBe(join(process.cwd(), ".jiratown.toml"));
  });

  it("respects XDG_DATA_HOME", async () => {
    const originalXdgData = process.env["XDG_DATA_HOME"];
    process.env["XDG_DATA_HOME"] = "/custom/data";

    try {
      // Re-import to pick up env change
      const { resolveConfigPaths } = await import("../resolve.ts");
      const paths = resolveConfigPaths();

      expect(paths.globalDir).toBe("/custom/data/jiratown");
      expect(paths.database).toBe("/custom/data/jiratown/jiratown.db");
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

      expect(paths.globalDir).toBe(join(homedir(), ".local", "share", "jiratown"));
    } finally {
      if (originalXdgData) process.env["XDG_DATA_HOME"] = originalXdgData;
      if (originalXdgConfig) process.env["XDG_CONFIG_HOME"] = originalXdgConfig;
    }
  });
});
