import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./loader";

let cwd = "";
let home = "";

/** Write a TOML file into the project `.workhorse` tree. */
function project(rel: string, body: string): void {
  const path = join(cwd, ".workhorse", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

/** Write a TOML file into the personal `~/.config/workhorse` tree. */
function personal(rel: string, body: string): void {
  const path = join(home, ".config", "workhorse", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "wh-cfg-cwd-"));
  home = mkdtempSync(join(tmpdir(), "wh-cfg-home-"));
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
  rmSync(home, { force: true, recursive: true });
});

describe("loadConfig", () => {
  it("returns schema defaults when no config directories exist", async () => {
    const result = await loadConfig(cwd, home);
    expect(result).toEqual({ presets: {}, workflows: {} });
  });

  it("loads config.toml into `config`", async () => {
    project("config.toml", '[defaults]\nmodel = "sonnet"\n');
    const result = await loadConfig(cwd, home);
    expect(result.config?.defaults?.model).toBe("sonnet");
  });

  it("mirrors a nested directory into keys (presets/<name>.toml → presets[name])", async () => {
    project("presets/web.toml", 'model = "opus"\ntools = ["read"]\n');
    const result = await loadConfig(cwd, home);
    expect(result.presets.web).toEqual({ model: "opus", tools: ["read"] });
  });

  it("assembles a nested workflow file into workflows[name]", async () => {
    project(
      "workflows/ralph.toml",
      [
        'name = "ralph"',
        'version = "1"',
        "",
        "[[states]]",
        'name = "planning"',
        'steps = ["plan"]',
        "",
        "[steps.plan]",
        'prologue = "Plan it"',
        "",
      ].join("\n"),
    );
    const result = await loadConfig(cwd, home);
    expect(result.workflows.ralph?.name).toBe("ralph");
    expect(result.workflows.ralph?.states[0]?.name).toBe("planning");
  });

  it("merges the personal and project trees with the project layer winning", async () => {
    personal("presets/shared.toml", 'model = "personal"\n');
    personal("presets/personal-only.toml", 'model = "kept"\n');
    project("presets/shared.toml", 'model = "project"\n');

    const result = await loadConfig(cwd, home);

    expect(result.presets.shared?.model).toBe("project");
    expect(result.presets["personal-only"]?.model).toBe("kept");
  });
});
