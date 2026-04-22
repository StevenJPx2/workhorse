import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { z } from "zod/v4";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeTempToml(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, "utf-8");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("resolveConfigPaths", () => {
  it("resolves paths with repoRoot", async () => {
    const { resolveConfigPaths } = await import("./resolve.ts");

    const paths = resolveConfigPaths("/some/repo");

    expect(paths.projectConfig).toBe("/some/repo/.jiratown.toml");
    expect(paths.globalDir).toContain("jiratown");
    expect(paths.database).toContain("jiratown.db");
    expect(paths.memoryDatabase).toContain("memory.db");
  });

  it("returns null projectConfig when no repoRoot provided", async () => {
    const { resolveConfigPaths } = await import("./resolve.ts");

    const paths = resolveConfigPaths();

    expect(paths.projectConfig).toBeNull();
  });

  it("respects XDG_DATA_HOME", async () => {
    const originalXdgData = process.env["XDG_DATA_HOME"];
    process.env["XDG_DATA_HOME"] = "/custom/data";

    try {
      // Re-import to pick up env change
      const { resolveConfigPaths } = await import("./resolve.ts");
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
      const { resolveConfigPaths } = await import("./resolve.ts");
      const paths = resolveConfigPaths();

      expect(paths.globalDir).toBe(join(homedir(), ".local", "share", "jiratown"));
    } finally {
      if (originalXdgData) process.env["XDG_DATA_HOME"] = originalXdgData;
      if (originalXdgConfig) process.env["XDG_CONFIG_HOME"] = originalXdgConfig;
    }
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config files exist", async () => {
    const { loadConfig } = await import("./load.ts");
    const { DEFAULT_CONFIG } = await import("./defaults.ts");

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
    const { loadConfig } = await import("./load.ts");

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
    const { loadConfig } = await import("./load.ts");
    const { DEFAULT_CONFIG } = await import("./defaults.ts");

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
    const { loadConfig } = await import("./load.ts");

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

describe("parseTomlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-parse-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty object for non-existent file", async () => {
    const { parseTomlFile } = await import("./parse.ts");
    expect(parseTomlFile(join(tmpDir, "nonexistent.toml"))).toEqual({});
  });

  it("returns empty object for null", async () => {
    const { parseTomlFile } = await import("./parse.ts");
    expect(parseTomlFile(null)).toEqual({});
  });

  it("returns empty object on invalid TOML", async () => {
    const { parseTomlFile } = await import("./parse.ts");
    const invalidPath = join(tmpDir, "bad.toml");
    writeFileSync(invalidPath, "this is not valid {{{ toml", "utf-8");
    expect(parseTomlFile(invalidPath)).toEqual({});
  });
});

describe("configToToml", () => {
  it("serializes to valid TOML with snake_case keys", async () => {
    const { configToToml } = await import("./parse.ts");

    const toml = configToToml({ agent: { harness: "opencode" }, ui: { theme: "tokyonight" } });

    expect(toml).toContain("[agent]");
    expect(toml).toContain('harness = "opencode"');
    expect(toml).toContain("[ui]");
    expect(toml).toContain('theme = "tokyonight"');
  });
});

describe("mergeConfigs", () => {
  it("project wins over global wins over base", async () => {
    const { mergeConfigs } = await import("./parse.ts");
    const { DEFAULT_CONFIG } = await import("./defaults.ts");

    const global = { ui: { theme: "gruvbox" } };
    const project = { ui: { theme: "nord" } };

    // last arg wins: global first, project last → project wins
    const result = mergeConfigs(DEFAULT_CONFIG, global, project);

    expect(result.ui.theme).toBe("nord");
  });

  it("deep merges nested objects", async () => {
    const { mergeConfigs } = await import("./parse.ts");
    const { DEFAULT_CONFIG } = await import("./defaults.ts");

    const override = { agent: { harness: "opencode" as const, model: "opus-4" } };
    const result = mergeConfigs(DEFAULT_CONFIG, override);

    expect(result.agent.harness).toBe("opencode"); // default preserved
    expect(result.agent.model).toBe("opus-4"); // override applied
  });
});

describe("jiratownConfigSchema", () => {
  it("validates a complete config", async () => {
    const { jiratownConfigSchema } = await import("./schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code", model: "opus-4" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: { custom: "Be helpful" },
      ui: { theme: "tokyonight" },
      plugins: { enabled: ["jira"], directories: [] },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid harness", async () => {
    const { jiratownConfigSchema } = await import("./schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "invalid-harness" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: { enabled: [], directories: [] },
    });

    expect(result.success).toBe(false);
  });

  it("allows passthrough for plugin-specific keys", async () => {
    const { jiratownConfigSchema } = await import("./schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "opencode" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: {
        enabled: ["jira"],
        directories: [],
        jira: { cloudId: "company.atlassian.net" },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.plugins as Record<string, unknown>)["jira"]).toEqual({
        cloudId: "company.atlassian.net",
      });
    }
  });
});

describe("writeTomlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-write-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes config to file and can be read back", async () => {
    const { writeTomlFile, parseTomlFile } = await import("./parse.ts");

    const filePath = join(tmpDir, "config.toml");
    writeTomlFile(filePath, { agent: { harness: "claude-code", model: "sonnet-4" } });

    const parsed = parseTomlFile(filePath);
    expect(parsed.agent?.harness).toBe("claude-code");
    expect(parsed.agent?.model).toBe("sonnet-4");
  });
});
