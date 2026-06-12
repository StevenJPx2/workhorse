import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defineSkill } from "#schema";

import { SkillService } from "../skill";
import { context } from "./fixture";

let home = "";
let cwd = "";

function write(base: string, rel: string, body: string): void {
  const path = join(base, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "workhorse-home-"));
  cwd = mkdtempSync(join(tmpdir(), "workhorse-skills-"));
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  rmSync(cwd, { force: true, recursive: true });
});

describe("SkillService", () => {
  it("scans .claude/.agents skills on setup, parsing frontmatter", async () => {
    write(
      cwd,
      ".claude/skills/pr/SKILL.md",
      "---\nname: pr_review\n---\nCheck the diff.",
    );
    write(cwd, ".agents/skills/house.md", "Keep diffs small.");

    const skills = new SkillService(cwd, home);
    await skills.setup(context());

    const names = skills.list().map((s) => s.name);
    expect(names).toContain("pr_review");
    expect(names).toContain("house");
  });

  it("namespaces companion fragments as <scope>:<file>", async () => {
    write(cwd, ".claude/skills/pr/SKILL.md", "Main.");
    write(cwd, ".claude/skills/pr/checklist.md", "Checklist body.");

    const skills = new SkillService(cwd, home);
    await skills.setup(context());

    const fragment = skills.list().find((s) => s.name === "pr:checklist");
    expect(fragment?.scope).toBe("pr");
  });

  it("lets the project root override a global skill of the same name", async () => {
    write(home, ".claude/skills/shared.md", "global version");
    write(cwd, ".claude/skills/shared.md", "project version");

    const skills = new SkillService(cwd, home);
    await skills.setup(context());

    const matches = skills.list().filter((s) => s.name === "shared");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.instructions).toBe("project version");
  });
});

async function loadSkill(cwd_: string, home_: string) {
  const ctx = context();
  const registered = vi.fn();
  ctx.hooks.hook("tools:register", registered);
  const service = new SkillService(cwd_, home_);
  await service.setup(ctx);

  return { ctx, service, tool: registered.mock.calls[0]?.[0].tool };
}

describe("SkillService registry", () => {
  it("contributes a load_skill tool that lists and loads skills", async () => {
    write(
      cwd,
      ".claude/skills/pr.md",
      "---\ndescription: Review\n---\nDiff carefully.",
    );
    const { ctx, tool } = await loadSkill(cwd, home);
    const runCtx = { ...ctx, cwd };

    expect(tool.name).toBe("load_skill");
    await expect(tool.execute({}, runCtx)).resolves.toEqual({
      ok: true,
      output: "- **pr**: Review",
    });
    await expect(tool.execute({ name: "pr" }, runCtx)).resolves.toEqual({
      ok: true,
      output: "Diff carefully.",
    });
    await expect(tool.execute({ name: "nope" }, runCtx)).resolves.toEqual({
      error: 'No skill named "nope".',
      ok: false,
    });
  });

  it("load_skill invokes a skill's custom renderer", async () => {
    const { ctx, tool } = await loadSkill(cwd, home);
    await ctx.hooks.callHook("skills:register", {
      skill: defineSkill({
        description: "Dyn",
        instructions: "static",
        name: "dyn",
        render: (runCtx) => `rendered for ${runCtx.cwd}`,
      }),
    });

    await expect(
      tool.execute({ name: "dyn" }, { ...ctx, cwd: "/wt" }),
    ).resolves.toEqual({
      ok: true,
      output: "rendered for /wt",
    });
  });
});

describe("SkillService registry — edges", () => {
  it("load_skill reports an empty catalogue", async () => {
    const { ctx, tool } = await loadSkill(cwd, home);
    await expect(tool.execute({}, { ...ctx, cwd })).resolves.toEqual({
      ok: true,
      output: "No skills are available.",
    });
  });

  it("keeps a runtime-registered skill, then releases on teardown", async () => {
    const ctx = context();
    const skills = new SkillService(cwd, home);
    await skills.setup(ctx);

    await ctx.hooks.callHook("skills:register", {
      skill: defineSkill({
        description: "House style",
        instructions: "Small diffs.",
        name: "house_style",
      }),
    });
    expect(
      skills.list().find((s) => s.name === "house_style")?.instructions,
    ).toBe("Small diffs.");

    skills.teardown();
    expect(skills.list()).toEqual([]);
  });
});
