import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverSkills } from "../discover";

import { agentsSkill, claudeSkill, fm, write } from "./fixture";

const migrateScript = [
  "# ---",
  "# description: Run migrations",
  "# args:",
  "#   positional:",
  "#     - name: env",
  "#       description: Target environment",
  "#       required: true",
  "#   options: []",
  "# ---",
  "echo migrate",
  "",
].join("\n");

let home = "";
let cwd = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wh-home-"));
  cwd = mkdtempSync(join(tmpdir(), "wh-proj-"));
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  rmSync(cwd, { force: true, recursive: true });
  vi.restoreAllMocks();
});

describe("discoverSkills - basics", () => {
  it("returns an empty list when no roots exist", () => {
    expect(discoverSkills(cwd, home)).toEqual([]);
  });

  it("discovers a SKILL.md directory and sets name/scope/instructions", () => {
    claudeSkill(home, "pr", fm("pr", "Open a PR", "Main body."));

    const pr = discoverSkills(cwd, home).find((s) => s.name === "pr");
    expect(pr?.scope).toBe("pr");
    expect(pr?.description).toBe("Open a PR");
    expect(pr?.instructions).toBe("Main body.");
  });

  it("enumerates bundled resources one level down, excluding SKILL.md", () => {
    agentsSkill(cwd, "pdf", fm("pdf", "Handle PDFs"));
    write(cwd, ".agents/skills/pdf/scripts/extract.py", "print(1)");
    write(cwd, ".agents/skills/pdf/references/REFERENCE.md", "ref");
    write(cwd, ".agents/skills/pdf/notes.md", "loose note");

    const pdf = discoverSkills(cwd, home).find((s) => s.name === "pdf");
    expect(pdf?.resources).toEqual([
      "notes.md",
      "references/REFERENCE.md",
      "scripts/extract.py",
    ]);
  });

  it("lets a project skill override a user skill of the same name (warns)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    claudeSkill(home, "shared", fm("shared", "User", "user version"));
    claudeSkill(cwd, "shared", fm("shared", "Proj", "project version"));

    const shared = discoverSkills(cwd, home).filter((s) => s.name === "shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.instructions).toBe("project version");
    expect(warn.mock.calls.flat().join("\n")).toContain("WH_SKILL_SHADOWED");
  });
});

describe("discoverSkills - filtering", () => {
  it("ignores directories without a SKILL.md", () => {
    write(cwd, ".claude/skills/not-a-skill/README.md", "nope");
    claudeSkill(cwd, "real", fm("real", "Real skill"));

    expect(discoverSkills(cwd, home).map((s) => s.name)).toEqual(["real"]);
  });

  it("ignores loose files sitting directly in a skill root", () => {
    write(cwd, ".claude/skills/loose.md", "not a skill dir");
    claudeSkill(cwd, "real", fm("real", "Real skill"));

    expect(discoverSkills(cwd, home).map((s) => s.name)).toEqual(["real"]);
  });

  it("parses optional spec frontmatter fields", () => {
    agentsSkill(
      cwd,
      "rich",
      [
        "---",
        "name: rich",
        "description: Rich skill",
        "license: Apache-2.0",
        "compatibility: Requires git",
        "allowed-tools: Read Bash(git:*)",
        "metadata:",
        "  author: me",
        '  version: "1.0"',
        "---",
        "Body.",
      ].join("\n"),
    );

    const rich = discoverSkills(cwd, home).find((s) => s.name === "rich");
    expect(rich?.license).toBe("Apache-2.0");
    expect(rich?.compatibility).toBe("Requires git");
    expect(rich?.allowed_tools).toBe("Read Bash(git:*)");
    expect(rich?.metadata).toEqual({ author: "me", version: "1.0" });
  });
});

describe("discoverSkills - lenient validation", () => {
  it("warns but still loads when name does not match the directory", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    agentsSkill(cwd, "dir-name", fm("other", "Mismatch"));

    const skills = discoverSkills(cwd, home);
    expect(skills.find((s) => s.name === "other")?.scope).toBe("dir-name");
    expect(warn.mock.calls.flat().join("\n")).toContain(
      "WH_SKILL_NAME_MISMATCH",
    );
  });

  it("falls back to the directory name when frontmatter omits name", () => {
    agentsSkill(cwd, "plain", "---\ndescription: No name\n---\nBody.");

    const plain = discoverSkills(cwd, home).find((s) => s.name === "plain");
    expect(plain?.description).toBe("No name");
  });

  it("skips a skill that has no description (error)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    agentsSkill(cwd, "nodesc", "---\nname: nodesc\n---\nBody.");

    expect(discoverSkills(cwd, home)).toHaveLength(0);
    expect(error.mock.calls.flat().join("\n")).toContain(
      "WH_SKILL_NO_DESCRIPTION",
    );
  });

  it("warns when the name exceeds 64 characters", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const long = "a".repeat(70);
    agentsSkill(cwd, long, fm(long, "Too long"));

    discoverSkills(cwd, home);
    expect(warn.mock.calls.flat().join("\n")).toContain(
      "WH_SKILL_NAME_TOO_LONG",
    );
  });
});

describe("discoverSkills - scripts", () => {
  it("discovers .sh scripts inside the skill's scripts/ directory", () => {
    agentsSkill(cwd, "deploy", fm("deploy", "Deploy skill"));
    write(cwd, ".agents/skills/deploy/scripts/migrate.sh", migrateScript);

    const deploy = discoverSkills(cwd, home).find((s) => s.name === "deploy");

    expect(deploy?.scripts).toHaveLength(1);
    expect(deploy?.scripts?.[0]).toEqual({
      args: {
        options: [],
        positional: [
          {
            description: "Target environment",
            name: "env",
            required: true,
          },
        ],
      },
      description: "Run migrations",
      name: "migrate",
    });
  });

  it("falls back to a default script description when front matter is missing", () => {
    agentsSkill(cwd, "ops", fm("ops", "Ops skill"));
    write(cwd, ".agents/skills/ops/scripts/restart.sh", "echo restart\n");

    const ops = discoverSkills(cwd, home).find((s) => s.name === "ops");

    expect(ops?.scripts?.[0]?.name).toBe("restart");
    expect(ops?.scripts?.[0]?.description).toBe("Script: restart");
    expect(ops?.scripts?.[0]?.args).toEqual({ options: [], positional: [] });
  });

  it("ignores non-.sh files in scripts/", () => {
    agentsSkill(cwd, "clean", fm("clean", "Clean skill"));
    write(cwd, ".agents/skills/clean/scripts/readme.txt", "not a script");

    const clean = discoverSkills(cwd, home).find((s) => s.name === "clean");
    expect(clean?.scripts).toEqual([]);
  });
});
