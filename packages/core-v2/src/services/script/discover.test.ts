import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SCRIPTS_DIR, discoverScripts } from "./discover";

let cwd = "";
let home = "";

function write(name: string, body: string): void {
  const dir = join(cwd, SCRIPTS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), body);
}

function writeSkillScript(skill: string, name: string, body: string): void {
  const skillDir = join(home, ".agents", "skills", skill);
  mkdirSync(join(skillDir, "scripts"), { recursive: true });

  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skill}\ndescription: Test\n---\n`,
  );
  writeFileSync(join(skillDir, "scripts", name), body);
}

function writeGlobalScript(name: string, body: string): void {
  const dir = join(home, SCRIPTS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), body);
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "wh-scripts-"));
  home = mkdtempSync(join(tmpdir(), "wh-home-"));
  mkdirSync(join(cwd, SCRIPTS_DIR), { recursive: true });
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
  rmSync(home, { force: true, recursive: true });
});

describe("discoverScripts", () => {
  it("returns [] when the directory is empty", () => {
    expect(discoverScripts(cwd, home)).toEqual([]);
  });

  it("skips the shebang and uses the first comment as the description", () => {
    write(
      "ci.sh",
      "#!/usr/bin/env bash\n# Run continuous integration\nbun test\n",
    );
    expect(discoverScripts(cwd, home)[0]?.description).toBe(
      "Run continuous integration",
    );
  });

  it("falls back to a default description when the script opens with code", () => {
    write("bare.sh", "bun test\n# too late\n");
    expect(discoverScripts(cwd, home)[0]?.description).toBe("Script: bare");
  });

  it("ignores non-.sh files", () => {
    write("readme.txt", "not a script");
    write("real.sh", "# Real\necho hi\n");
    expect(discoverScripts(cwd, home).map((s) => s.name)).toEqual(["real"]);
  });
});

describe("discoverScripts args", () => {
  it("recovers the args contract from #workhorse:args front-matter", () => {
    write(
      "deploy.sh",
      '#workhorse:args {"positional":[{"name":"env","description":"Env","required":true}],"options":[{"name":"force","description":"Force"}]}\n' +
        "# Deploy the app\necho deploy\n",
    );
    const [script] = discoverScripts(cwd, home);
    expect(script?.description).toBe("Deploy the app");
    expect(script?.args.positional[0]?.name).toBe("env");
    expect(script?.args.options[0]?.name).toBe("force");
  });

  it("defaults to an empty args contract without front-matter", () => {
    write("plain.sh", "# Plain\necho hi\n");
    const [script] = discoverScripts(cwd, home);
    expect(script?.args).toEqual({ options: [], positional: [] });
  });

  it("uses the fallback description when the file is only ignored lines", () => {
    write(
      "empty.sh",
      '#!/bin/sh\n#workhorse:args {"positional":[],"options":[]}\n',
    );
    expect(discoverScripts(cwd, home)[0]?.description).toBe("Script: empty");
  });
});

describe("discoverScripts global scripts", () => {
  it("loads .sh files from ~/.workhorse/scripts/", () => {
    writeGlobalScript("lint.sh", "# Lint everything\necho lint\n");
    const scripts = discoverScripts(cwd, home);
    expect(scripts.find((s) => s.name === "lint")?.description).toBe(
      "Lint everything",
    );
  });

  it("combines project, global, and skill scripts", () => {
    write("ci.sh", "# CI\necho ci\n");
    writeGlobalScript("lint.sh", "# Lint\necho lint\n");
    writeSkillScript("deploy", "migrate.sh", "# Migrate\necho migrate\n");
    const names = discoverScripts(cwd, home).map((s) => s.name);
    expect(names).toContain("ci");
    expect(names).toContain("lint");
    expect(names).toContain("deploy:migrate");
  });
});

describe("discoverScripts skill scripts", () => {
  it("loads .sh files from skill scripts/ directories", () => {
    writeSkillScript(
      "deploy",
      "migrate.sh",
      "# Run migrations\necho migrate\n",
    );
    const scripts = discoverScripts(cwd, home);
    expect(scripts.find((s) => s.name === "deploy:migrate")?.description).toBe(
      "Run migrations",
    );
  });

  it("combines workhorse scripts and skill scripts", () => {
    write("ci.sh", "# CI\necho ci\n");
    writeSkillScript("deploy", "migrate.sh", "# Migrate\necho migrate\n");
    const names = discoverScripts(cwd, home).map((s) => s.name);
    expect(names).toContain("ci");
    expect(names).toContain("deploy:migrate");
  });

  it("ignores skill scripts/ dirs without .sh files", () => {
    const skillDir = join(home, ".agents", "skills", "empty");
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: empty\ndescription: Test\n---\n",
    );
    writeFileSync(join(skillDir, "scripts", "readme.txt"), "not a script");
    expect(discoverScripts(cwd, home)).toEqual([]);
  });
});
