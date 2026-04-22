import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeTempToml(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, "utf-8");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config files exist", async () => {
    const { loadConfig } = await import("../load.ts");
    const { DEFAULT_CONFIG } = await import("../defaults.ts");

    const paths = {
      globalDir: tmpDir,
      globalConfig: join(tmpDir, "global.toml"),
      projectConfig: join(tmpDir, "project.toml"),
      database: join(tmpDir, "jiratown.db"),
      memoryDatabase: join(tmpDir, "memory.db"),
    };

    const config = loadConfig(paths);

    expect(config.agent.harness).toBe(DEFAULT_CONFIG.agent.harness);
    expect(config.behavior.autoResume).toBe(DEFAULT_CONFIG.behavior.autoResume);
    expect(config.ui.theme).toBe(DEFAULT_CONFIG.ui.theme);
  });

  it("merges project config over defaults", async () => {
    const { loadConfig } = await import("../load.ts");

    writeTempToml(
      tmpDir,
      ".jiratown.toml",
      `
[agent]
harness = "claude-code"
model = "opus-4"

[behavior]
auto_resume = false
poll_interval = 60000

[ui]
theme = "gruvbox"
`,
    );

    const paths = {
      globalDir: tmpDir,
      globalConfig: join(tmpDir, "nonexistent.toml"),
      projectConfig: join(tmpDir, ".jiratown.toml"),
      database: join(tmpDir, "jiratown.db"),
      memoryDatabase: join(tmpDir, "memory.db"),
    };

    const config = loadConfig(paths);

    expect(config.agent.harness).toBe("claude-code");
    expect(config.agent.model).toBe("opus-4");
    expect(config.behavior.autoResume).toBe(false);
    expect(config.behavior.pollInterval).toBe(60_000);
    expect(config.ui.theme).toBe("gruvbox");
  });

  it("handles null projectConfig", async () => {
    const { loadConfig } = await import("../load.ts");
    const { DEFAULT_CONFIG } = await import("../defaults.ts");

    const paths = {
      globalDir: tmpDir,
      globalConfig: join(tmpDir, "nonexistent.toml"),
      projectConfig: null,
      database: join(tmpDir, "jiratown.db"),
      memoryDatabase: join(tmpDir, "memory.db"),
    };

    const config = loadConfig(paths);

    expect(config.agent.harness).toBe(DEFAULT_CONFIG.agent.harness);
  });

  it("parses plugin sections into camelCase", async () => {
    const { loadConfig } = await import("../load.ts");

    writeTempToml(
      tmpDir,
      ".jiratown.toml",
      `
[plugins]
enabled = ["jira", "github"]
directories = ["/custom/plugins"]

[plugins.jira]
cloud_id = "company.atlassian.net"
`,
    );

    const paths = {
      globalDir: tmpDir,
      globalConfig: join(tmpDir, "nonexistent.toml"),
      projectConfig: join(tmpDir, ".jiratown.toml"),
      database: join(tmpDir, "jiratown.db"),
      memoryDatabase: join(tmpDir, "memory.db"),
    };

    const config = loadConfig(paths);

    expect(config.plugins.enabled).toEqual(["jira", "github"]);
    expect(config.plugins.directories).toEqual(["/custom/plugins"]);
    expect((config.plugins["jira"] as Record<string, unknown>)?.["cloudId"]).toBe(
      "company.atlassian.net",
    );
  });
});
