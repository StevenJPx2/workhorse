import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("parseTomlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-parse-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty object for non-existent file", async () => {
    const { parseTomlFile } = await import("../parse.ts");
    expect(parseTomlFile(join(tmpDir, "nonexistent.toml"))).toEqual({});
  });

  it("returns empty object for null", async () => {
    const { parseTomlFile } = await import("../parse.ts");
    expect(parseTomlFile(null)).toEqual({});
  });

  it("returns empty object on invalid TOML", async () => {
    const { parseTomlFile } = await import("../parse.ts");
    const invalidPath = join(tmpDir, "bad.toml");
    writeFileSync(invalidPath, "this is not valid {{{ toml", "utf-8");
    expect(parseTomlFile(invalidPath)).toEqual({});
  });
});

describe("configToToml", () => {
  it("serializes to valid TOML with snake_case keys", async () => {
    const { configToToml } = await import("../parse.ts");

    const toml = configToToml({
      agent: { harness: "opencode" },
      ui: { theme: "tokyonight" },
    });

    expect(toml).toContain("[agent]");
    expect(toml).toContain('harness = "opencode"');
    expect(toml).toContain("[ui]");
    expect(toml).toContain('theme = "tokyonight"');
  });
});

describe("mergeConfigs", () => {
  it("project wins over global wins over base", async () => {
    const { mergeConfigs } = await import("../parse.ts");
    const { DEFAULT_CONFIG } = await import("../defaults.ts");

    const global = { ui: { theme: "gruvbox" } };
    const project = { ui: { theme: "nord" } };

    // last arg wins: global first, project last → project wins
    const result = mergeConfigs(DEFAULT_CONFIG, global, project);

    expect(result.ui.theme).toBe("nord");
  });

  it("deep merges nested objects", async () => {
    const { mergeConfigs } = await import("../parse.ts");
    const { DEFAULT_CONFIG } = await import("../defaults.ts");

    const override = {
      agent: { harness: "opencode" as const, model: "opus-4" },
    };
    const result = mergeConfigs(DEFAULT_CONFIG, override);

    expect(result.agent.harness).toBe("opencode"); // default preserved
    expect(result.agent.model).toBe("opus-4"); // override applied
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
    const { writeTomlFile, parseTomlFile } = await import("../parse.ts");

    const filePath = join(tmpDir, "config.toml");
    writeTomlFile(filePath, {
      agent: { harness: "claude-code", model: "sonnet-4" },
    });

    const parsed = parseTomlFile(filePath);
    expect(parsed.agent?.harness).toBe("claude-code");
    expect(parsed.agent?.model).toBe("sonnet-4");
  });
});
