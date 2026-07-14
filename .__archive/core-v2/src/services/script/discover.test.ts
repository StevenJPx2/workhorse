import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  vi.restoreAllMocks();
});

describe("discoverScripts", () => {
  it("returns [] when the directory is empty", () => {
    expect(discoverScripts(cwd, home)).toEqual([]);
  });

  it("reads the description from the front-matter block", () => {
    write(
      "ci.sh",
      "#!/usr/bin/env bash\n# ---\n# description: Run continuous integration\n# ---\nbun test\n",
    );
    expect(discoverScripts(cwd, home)[0]?.description).toBe(
      "Run continuous integration",
    );
  });

  it("falls back to a default description when there is no front matter", () => {
    write("bare.sh", "bun test\n# too late\n");
    expect(discoverScripts(cwd, home)[0]?.description).toBe("Script: bare");
  });

  it("keeps the whole file (including header) as the command", () => {
    write("ci.sh", "# ---\n# description: CI\n# ---\nbun test\n");
    expect(discoverScripts(cwd, home)[0]?.command).toBe(
      "# ---\n# description: CI\n# ---\nbun test\n",
    );
  });

  it("ignores non-.sh files", () => {
    write("readme.txt", "not a script");
    write("real.sh", "# ---\n# description: Real\n# ---\necho hi\n");
    expect(discoverScripts(cwd, home).map((s) => s.name)).toEqual(["real"]);
  });
});

describe("discoverScripts args", () => {
  it("recovers the args contract from the front-matter block", () => {
    write(
      "deploy.sh",
      [
        "# ---",
        "# description: Deploy the app",
        "# args:",
        "#   positional:",
        "#     - name: env",
        "#       description: Env",
        "#       required: true",
        "#   options:",
        "#     - name: force",
        "#       description: Force",
        "# ---",
        "echo deploy",
        "",
      ].join("\n"),
    );
    const [script] = discoverScripts(cwd, home);
    expect(script?.description).toBe("Deploy the app");
    expect(script?.args.positional[0]?.name).toBe("env");
    expect(script?.args.positional[0]?.required).toBe(true);
    expect(script?.args.options[0]?.name).toBe("force");
  });

  it("defaults to an empty args contract without front matter", () => {
    write("plain.sh", "echo hi\n");
    const [script] = discoverScripts(cwd, home);
    expect(script?.args).toEqual({ options: [], positional: [] });
  });

  it("uses the fallback description when the block only sets args", () => {
    write(
      "empty.sh",
      "#!/bin/sh\n# ---\n# args:\n#   positional: []\n#   options: []\n# ---\n",
    );
    expect(discoverScripts(cwd, home)[0]?.description).toBe("Script: empty");
  });
});

describe("discoverScripts global scripts", () => {
  it("loads .sh files from ~/.workhorse/scripts/", () => {
    writeGlobalScript(
      "lint.sh",
      "# ---\n# description: Lint everything\n# ---\necho lint\n",
    );
    const scripts = discoverScripts(cwd, home);
    expect(scripts.find((s) => s.name === "lint")?.description).toBe(
      "Lint everything",
    );
  });

  it("combines project, global, and skill scripts", () => {
    write("ci.sh", "echo ci\n");
    writeGlobalScript("lint.sh", "echo lint\n");
    writeSkillScript("deploy", "migrate.sh", "echo migrate\n");
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
      "# ---\n# description: Run migrations\n# ---\necho migrate\n",
    );
    const scripts = discoverScripts(cwd, home);
    expect(scripts.find((s) => s.name === "deploy:migrate")?.description).toBe(
      "Run migrations",
    );
  });

  it("combines workhorse scripts and skill scripts", () => {
    write("ci.sh", "echo ci\n");
    writeSkillScript("deploy", "migrate.sh", "echo migrate\n");
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

describe("discoverScripts diagnostics", () => {
  it("reports WH_SCRIPT_INVALID and skips a script with an invalid args block", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    write(
      "bad.sh",
      "# ---\n# description: Bad\n# args: oops\n# ---\necho hi\n",
    );

    const scripts = discoverScripts(cwd, home);

    expect(scripts.map((s) => s.name)).not.toContain("bad");
    expect(error.mock.calls.flat().join("\n")).toContain("WH_SCRIPT_INVALID");
  });
});
