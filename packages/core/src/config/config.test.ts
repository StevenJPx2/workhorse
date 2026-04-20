import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod/v4";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeTempToml(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, "utf-8");
}

// Load with both global and project dirs pointing at tmpDir (no real ~/.jiratown).
async function loadIsolated(toml?: string) {
  const { Config } = await import("./config.ts");
  const dir = mkdtempSync(join(tmpdir(), "jiratown-cfg-"));
  if (toml) writeTempToml(dir, ".jiratown.toml", toml);
  const cfg = new Config().load(dir, dir);
  return { cfg, dir };
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

  // ── load ──────────────────────────────────────────────────────────────────

  it("returns defaults when no config files exist", async () => {
    const { DEFAULT_CONFIG } = await import("./defaults.ts");
    const { cfg } = await loadIsolated();
    const config = cfg.get();

    expect(config.agent.harness).toBe(DEFAULT_CONFIG.agent.harness);
    expect(config.behavior.autoResume).toBe(DEFAULT_CONFIG.behavior.autoResume);
    expect(config.behavior.pollInterval).toBe(DEFAULT_CONFIG.behavior.pollInterval);
    expect(config.ui.theme).toBe(DEFAULT_CONFIG.ui.theme);
    expect(config.plugins.enabled).toEqual([]);
  });

  it("merges project config over defaults", async () => {
    const { cfg } = await loadIsolated(`
[agent]
harness = "claude-code"
model = "opus-4"

[behavior]
auto_resume = false
poll_interval = 60000

[ui]
theme = "gruvbox"
`);
    const config = cfg.get();
    expect(config.agent.harness).toBe("claude-code");
    expect(config.agent.model).toBe("opus-4");
    expect(config.behavior.autoResume).toBe(false);
    expect(config.behavior.pollInterval).toBe(60_000);
    expect(config.ui.theme).toBe("gruvbox");
  });

  it("parses plugin sections into camelCase", async () => {
    const { cfg } = await loadIsolated(`
[plugins]
enabled = ["jira", "github"]
directories = ["/custom/plugins"]

[plugins.jira]
cloud_id = "company.atlassian.net"
`);
    const config = cfg.get();
    expect(config.plugins.enabled).toEqual(["jira", "github"]);
    expect(config.plugins.directories).toEqual(["/custom/plugins"]);
    expect((config.plugins["jira"] as Record<string, unknown>)?.["cloudId"]).toBe(
      "company.atlassian.net",
    );
  });

  it("global config is overridden by project config", async () => {
    const { Config } = await import("./config.ts");

    writeTempToml(tmpDir, "config.toml", `[ui]\ntheme = "gruvbox"\n`);
    writeTempToml(tmpDir, ".jiratown.toml", `[ui]\ntheme = "nord"\n`);

    const config = new Config().load(tmpDir, tmpDir).get();
    expect(config.ui.theme).toBe("nord");
  });

  // ── saveProject / reload ──────────────────────────────────────────────────

  it("saves project config and re-loads it", async () => {
    const { Config } = await import("./config.ts");

    const cfg = new Config();
    cfg.saveProject(tmpDir, { agent: { harness: "claude-code", model: "sonnet-4" } });

    const reloaded = new Config().load(tmpDir, tmpDir).get();
    expect(reloaded.agent.harness).toBe("claude-code");
    expect(reloaded.agent.model).toBe("sonnet-4");
  });

  // ── paths ─────────────────────────────────────────────────────────────────

  it("resolves correct config paths", async () => {
    const { Config } = await import("./config.ts");

    const paths = new Config().paths("/some/repo");
    expect(paths.globalConfig).toContain(".jiratown/config.toml");
    expect(paths.database).toContain(".jiratown/jiratown.db");
    expect(paths.projectConfig).toBe("/some/repo/.jiratown.toml");
  });

  it("returns null projectConfig when no repoRoot provided", async () => {
    const { Config } = await import("./config.ts");
    expect(new Config().paths().projectConfig).toBeNull();
  });

  // ── registerPluginConfig ──────────────────────────────────────────────────

  it("does not throw for valid plugin config", async () => {
    const { cfg } = await loadIsolated(`
[plugins.jira]
cloud_id = "company.atlassian.net"
`);
    expect(() =>
      cfg.registerPluginConfig({
        pluginName: "jira",
        schema: z.object({ cloudId: z.string().min(1) }),
      }),
    ).not.toThrow();
  });

  it("throws for invalid plugin config", async () => {
    const { cfg } = await loadIsolated(`
[plugins.jira]
cloud_id = ""
`);
    expect(() =>
      cfg.registerPluginConfig({
        pluginName: "jira",
        schema: z.object({ cloudId: z.string().min(1) }),
      }),
    ).toThrow('Invalid config for plugin "jira"');
  });

  it("throws when plugin config is missing entirely", async () => {
    const { cfg } = await loadIsolated();
    expect(() =>
      cfg.registerPluginConfig({
        pluginName: "jira",
        schema: z.object({ cloudId: z.string().min(1) }),
      }),
    ).toThrow('Invalid config for plugin "jira"');
  });

  // ── getPluginConfig ───────────────────────────────────────────────────────

  it("getPluginConfig returns typed config section", async () => {
    const { cfg } = await loadIsolated(`
[plugins.github]
auto_poll_reviews = true
`);
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
});
