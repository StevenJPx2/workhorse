import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod/v4";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeTempToml(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, "utf-8");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── constructor ───────────────────────────────────────────────────────────

  it("merges project config over defaults", async () => {
    const { Config } = await import("./config.ts");

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

    const config = new Config(tmpDir).get();
    expect(config.agent.harness).toBe("claude-code");
    expect(config.agent.model).toBe("opus-4");
    expect(config.behavior.autoResume).toBe(false);
    expect(config.behavior.pollInterval).toBe(60_000);
    expect(config.ui.theme).toBe("gruvbox");
  });

  it("parses plugin sections into camelCase", async () => {
    const { Config } = await import("./config.ts");

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

    const config = new Config(tmpDir).get();
    expect(config.plugins.enabled).toEqual(["jira", "github"]);
    expect(config.plugins.directories).toEqual(["/custom/plugins"]);
    expect((config.plugins["jira"] as Record<string, unknown>)?.["cloudId"]).toBe(
      "company.atlassian.net",
    );
  });

  // ── saveProject / reload ──────────────────────────────────────────────────

  it("saves project config and re-loads it", async () => {
    const { Config } = await import("./config.ts");

    const cfg = new Config();
    cfg.saveProject(tmpDir, { agent: { harness: "claude-code", model: "sonnet-4" } });

    const reloaded = new Config(tmpDir).get();
    expect(reloaded.agent.harness).toBe("claude-code");
    expect(reloaded.agent.model).toBe("sonnet-4");
  });

  // ── paths ─────────────────────────────────────────────────────────────────

  it("resolves correct config paths", async () => {
    const { Config } = await import("./config.ts");

    const paths = new Config().paths("/some/repo");
    expect(paths.globalConfig).toMatch(/\.jiratown.*config\.toml$/);
    expect(paths.database).toMatch(/\.jiratown.*jiratown\.db$/);
    expect(paths.projectConfig).toBe("/some/repo/.jiratown.toml");
  });

  it("returns null projectConfig when no repoRoot provided", async () => {
    const { Config } = await import("./config.ts");
    expect(new Config().paths().projectConfig).toBeNull();
  });

  // ── registerPluginConfig ──────────────────────────────────────────────────

  it("does not throw for valid plugin config", async () => {
    const { Config } = await import("./config.ts");

    writeTempToml(
      tmpDir,
      ".jiratown.toml",
      `
[plugins.jira]
cloud_id = "company.atlassian.net"
`,
    );

    const cfg = new Config(tmpDir);
    expect(() =>
      cfg.registerPluginConfig({
        pluginName: "jira",
        schema: z.object({ cloudId: z.string().min(1) }),
      }),
    ).not.toThrow();
  });

  it("throws for invalid plugin config", async () => {
    const { Config } = await import("./config.ts");

    writeTempToml(
      tmpDir,
      ".jiratown.toml",
      `
[plugins.jira]
cloud_id = ""
`,
    );

    const cfg = new Config(tmpDir);
    expect(() =>
      cfg.registerPluginConfig({
        pluginName: "jira",
        schema: z.object({ cloudId: z.string().min(1) }),
      }),
    ).toThrow('Invalid config for plugin "jira"');
  });

  it("throws when plugin config is missing entirely", async () => {
    const { Config } = await import("./config.ts");

    const cfg = new Config(tmpDir);
    expect(() =>
      cfg.registerPluginConfig({
        pluginName: "jira",
        schema: z.object({ cloudId: z.string().min(1) }),
      }),
    ).toThrow('Invalid config for plugin "jira"');
  });

  // ── getPluginConfig ───────────────────────────────────────────────────────

  it("getPluginConfig returns typed config section", async () => {
    const { Config } = await import("./config.ts");

    writeTempToml(
      tmpDir,
      ".jiratown.toml",
      `
[plugins.github]
auto_poll_reviews = true
`,
    );

    const cfg = new Config(tmpDir);
    const github = cfg.getPluginConfig<{ autoPollReviews: boolean }>("github");
    expect(github?.autoPollReviews).toBe(true);
  });

  // ── parse helpers ─────────────────────────────────────────────────────────

  it("parseTomlFile returns empty object for non-existent file", async () => {
    const { parseTomlFile } = await import("./parse.ts");
    expect(parseTomlFile(join(tmpDir, "nonexistent.toml"))).toEqual({});
  });

  it("parseTomlFile returns empty object for null", async () => {
    const { parseTomlFile } = await import("./parse.ts");
    expect(parseTomlFile(null)).toEqual({});
  });

  it("configToToml serializes to valid TOML", async () => {
    const { configToToml } = await import("./parse.ts");

    const toml = configToToml({ agent: { harness: "opencode" }, ui: { theme: "tokyonight" } });
    expect(toml).toContain("[agent]");
    expect(toml).toContain('harness = "opencode"');
    expect(toml).toContain("[ui]");
    expect(toml).toContain('theme = "tokyonight"');
  });

  // ── mergeConfigs priority ─────────────────────────────────────────────────

  it("project wins over global wins over base", async () => {
    const { mergeConfigs } = await import("./parse.ts");
    const { DEFAULT_CONFIG } = await import("./defaults.ts");

    const global = { ui: { theme: "gruvbox" } };
    const project = { ui: { theme: "nord" } };

    // last arg wins: global first, project last → project wins
    const result = mergeConfigs(DEFAULT_CONFIG, global, project);
    expect(result.ui.theme).toBe("nord");
  });

  // ── saveProject edge cases ────────────────────────────────────────────────

  it("saveProject throws when no repoRoot", async () => {
    const { Config } = await import("./config.ts");
    const cfg = new Config();
    expect(() =>
      cfg.saveProject("", { agent: { harness: "opencode", model: "sonnet-4" } }),
    ).toThrow();
  });

  // ── parseTomlFile error handling ────────────────────────────────────────────

  it("parseTomlFile returns empty object on invalid TOML", async () => {
    const { parseTomlFile } = await import("./parse.ts");
    const invalidPath = join(tmpDir, "bad.toml");
    writeFileSync(invalidPath, "this is not valid {{{ toml", "utf-8");
    expect(parseTomlFile(invalidPath)).toEqual({});
  });
});
