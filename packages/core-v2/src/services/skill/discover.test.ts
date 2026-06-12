import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverSkills } from "./discover";

let home = "";
let cwd = "";

function write(base: string, rel: string, body: string): void {
  const path = join(base, rel);
  mkdirSync(join(path, ".."), { recursive: true });

  writeFileSync(path, body);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wh-home-"));
  cwd = mkdtempSync(join(tmpdir(), "wh-proj-"));
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  rmSync(cwd, { force: true, recursive: true });
});

describe("discoverSkills", () => {
  it("returns [] when no roots exist", () => {
    expect(discoverSkills(cwd, home)).toEqual([]);
  });

  it("reads SKILL.md, companion fragments, and loose .md (default description)", () => {
    write(home, ".claude/skills/pr/SKILL.md", "Main body.");
    write(home, ".claude/skills/pr/notes.md", "Notes body.");
    write(home, ".agents/skills/loose.md", "Loose body.");

    const byName = new Map(discoverSkills(cwd, home).map((s) => [s.name, s]));
    expect(byName.get("pr")?.scope).toBe("pr");
    expect(byName.get("pr:notes")?.instructions).toBe("Notes body.");
    expect(byName.get("loose")?.description).toBe("Skill: loose");
  });

  it("lets a project skill override a global one of the same name", () => {
    write(home, ".claude/skills/shared.md", "global version");
    write(cwd, ".claude/skills/shared.md", "project version");

    const shared = discoverSkills(cwd, home).filter((s) => s.name === "shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.instructions).toBe("project version");
  });

  it("ignores non-.md files sitting in a skill root", () => {
    write(cwd, ".claude/skills/notes.txt", "not a skill");
    write(cwd, ".claude/skills/real.md", "Real body.");

    expect(discoverSkills(cwd, home).map((s) => s.name)).toEqual(["real"]);
  });
});

describe("discoverSkills frontmatter", () => {
  it("honours frontmatter name/description, ignoring blank and unknown lines", () => {
    write(
      cwd,
      ".agents/skills/raw.md",
      "---\nname: nice\n\nignored: x\ndescription: A skill\n---\nBody.",
    );

    const skill = discoverSkills(cwd, home).find((s) => s.name === "nice");
    expect(skill?.description).toBe("A skill");
    expect(skill?.instructions).toBe("Body.");
  });

  it("uses filename + default description when frontmatter is absent", () => {
    write(cwd, ".agents/skills/plain.md", "Just a body, no frontmatter.");

    const skill = discoverSkills(cwd, home).find((s) => s.name === "plain");
    expect(skill?.description).toBe("Skill: plain");
    expect(skill?.instructions).toBe("Just a body, no frontmatter.");
  });
});
