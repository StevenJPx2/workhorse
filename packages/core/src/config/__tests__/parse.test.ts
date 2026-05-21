import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("parseTomlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "workhorse-parse-test-"));
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
    tmpDir = mkdtempSync(join(tmpdir(), "workhorse-write-test-"));
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

describe("edge cases and error handling", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "workhorse-edge-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parseTomlFile handles file with only comments", async () => {
    const { parseTomlFile } = await import("../parse.ts");
    const filePath = join(tmpDir, "comments-only.toml");
    writeFileSync(filePath, "# This is a comment\n# Another comment", "utf-8");
    expect(parseTomlFile(filePath)).toEqual({});
  });

  it("parseTomlFile handles empty file", async () => {
    const { parseTomlFile } = await import("../parse.ts");
    const filePath = join(tmpDir, "empty.toml");
    writeFileSync(filePath, "", "utf-8");
    expect(parseTomlFile(filePath)).toEqual({});
  });

  it("mergeConfigs handles deeply nested objects", async () => {
    const { mergeConfigs } = await import("../parse.ts");
    const { DEFAULT_CONFIG } = await import("../defaults.ts");

    const override = {
      plugins: { disabled: [], jira: { nested: { value: 2, extra: true } } },
    };

    const result = mergeConfigs(DEFAULT_CONFIG, override);
    const jiraConfig = result.plugins["jira"] as {
      nested: { value: number; extra: boolean };
    };
    expect(jiraConfig.nested.value).toBe(2);
    expect(jiraConfig.nested.extra).toBe(true);
  });

  it.fails("TODO: parseTomlFile should validate against schema", async () => {
    // Currently parseTomlFile just parses TOML without schema validation.
    // Future enhancement: validate against workhorseConfigSchema and throw
    // meaningful errors for invalid configurations.
    const { parseTomlFile } = await import("../parse.ts");
    const filePath = join(tmpDir, "invalid-schema.toml");
    writeFileSync(
      filePath,
      `[behavior]
poll_interval = -1000`,
      "utf-8",
    );
    // This should throw a validation error
    expect(() => parseTomlFile(filePath)).toThrow();
  });
});
