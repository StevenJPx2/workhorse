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

function skill(base: string, name: string, body: string): void {
  write(base, `.claude/skills/${name}/SKILL.md`, body);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "workhorse-home-"));
  cwd = mkdtempSync(join(tmpdir(), "workhorse-skills-"));
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  rmSync(cwd, { force: true, recursive: true });
  vi.restoreAllMocks();
});

describe("SkillService", () => {
  it("scans .claude/.agents skill directories on setup", async () => {
    skill(cwd, "pr_review", "---\nname: pr_review\ndescription: d\n---\nDiff.");
    write(
      cwd,
      ".agents/skills/house/SKILL.md",
      "---\nname: house\ndescription: d\n---\nKeep diffs small.",
    );

    const skills = new SkillService(cwd, home);
    await skills.setup(context());

    const names = skills.list().map((s) => s.name);
    expect(names).toContain("pr_review");
    expect(names).toContain("house");
  });

  it("reports WH_SKILL_NO_DESCRIPTION for malformed skills", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    skill(cwd, "nodesc", "---\nname: nodesc\n---\nBody.");

    await new SkillService(cwd, home).setup(context());

    expect(error.mock.calls.flat().join("\n")).toContain(
      "WH_SKILL_NO_DESCRIPTION",
    );
  });

  it("lets the project root override a global skill of the same name", async () => {
    skill(home, "shared", "---\nname: shared\ndescription: d\n---\nglobal");
    skill(cwd, "shared", "---\nname: shared\ndescription: d\n---\nproject");

    const skills = new SkillService(cwd, home);
    await skills.setup(context());

    const matches = skills.list().filter((s) => s.name === "shared");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.instructions).toBe("project");
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

describe("SkillService load_skill - list", () => {
  it("lists all skills when called with no name", async () => {
    skill(
      cwd,
      "pr",
      "---\nname: pr\ndescription: Review\n---\nDiff carefully.",
    );
    const { ctx, tool } = await loadSkill(cwd, home);
    const runCtx = { ...ctx, cwd };

    expect(tool.name).toBe("load_skill");
    await expect(tool.execute({}, runCtx)).resolves.toEqual({
      ok: true,
      output: "- **pr**: Review",
    });
  });

  it("reports an empty catalogue when no skills exist", async () => {
    const { ctx, tool } = await loadSkill(cwd, home);
    await expect(tool.execute({}, { ...ctx, cwd })).resolves.toEqual({
      ok: true,
      output: "No skills are available.",
    });
  });
});

describe("SkillService load_skill - load", () => {
  it("returns wrapped instructions with skill name", async () => {
    skill(
      cwd,
      "pr",
      "---\nname: pr\ndescription: Review\n---\nDiff carefully.",
    );
    const { ctx, tool } = await loadSkill(cwd, home);
    const runCtx = { ...ctx, cwd };

    const loaded = await tool.execute({ name: "pr" }, runCtx);
    expect(loaded.ok).toBe(true);
    expect(loaded.output).toContain("## pr");
    expect(loaded.output).toContain("Diff carefully.");
  });

  it("returns an error for a nonexistent skill", async () => {
    const { ctx, tool } = await loadSkill(cwd, home);
    const runCtx = { ...ctx, cwd };

    await expect(tool.execute({ name: "nope" }, runCtx)).resolves.toEqual({
      error: 'No skill named "nope".',
      ok: false,
    });
  });

  it("renders instructions with a resource listing", async () => {
    skill(cwd, "pdf", "---\nname: pdf\ndescription: PDFs\n---\nBody.");
    write(cwd, ".claude/skills/pdf/scripts/extract.py", "print('hi')");
    const { ctx, tool } = await loadSkill(cwd, home);

    const out = await tool.execute({ name: "pdf" }, ctx);
    expect(out.output).toContain("## pdf");
    expect(out.output).toContain("### Resources");
    expect(out.output).toContain("scripts/extract.py");
  });
});

describe("SkillService load_skill - resource read", () => {
  it("reads a bundled resource by relative path", async () => {
    skill(cwd, "pdf", "---\nname: pdf\ndescription: PDFs\n---\nBody.");
    write(cwd, ".claude/skills/pdf/scripts/extract.py", "print('hi')");
    const { ctx, tool } = await loadSkill(cwd, home);

    await expect(
      tool.execute({ name: "pdf", resource: "scripts/extract.py" }, ctx),
    ).resolves.toEqual({ ok: true, output: "print('hi')" });
  });
});

describe("SkillService load_skill - resource security", () => {
  it("refuses a path that escapes the skill directory", async () => {
    skill(cwd, "pdf", "---\nname: pdf\ndescription: PDFs\n---\nBody.");
    write(cwd, ".claude/skills/pdf/scripts/extract.py", "print('hi')");
    const { ctx, tool } = await loadSkill(cwd, home);

    const escape = await tool.execute(
      { name: "pdf", resource: "../../etc/passwd" },
      ctx,
    );
    expect(escape.ok).toBe(false);
  });

  it("refuses an unknown resource path", async () => {
    skill(cwd, "pdf", "---\nname: pdf\ndescription: PDFs\n---\nBody.");
    write(cwd, ".claude/skills/pdf/scripts/extract.py", "print('hi')");
    const { ctx, tool } = await loadSkill(cwd, home);

    const missing = await tool.execute(
      { name: "pdf", resource: "nope.txt" },
      ctx,
    );
    expect(missing.ok).toBe(false);
  });

  it("refuses a resource read on a skill without a directory", async () => {
    const { ctx, tool } = await loadSkill(cwd, home);
    await ctx.hooks.callHook("skills:register", {
      skill: defineSkill({
        description: "Runtime",
        instructions: "no dir",
        name: "runtime",
      }),
    });

    const out = await tool.execute({ name: "runtime", resource: "x.txt" }, ctx);
    expect(out.ok).toBe(false);
    expect(out.error).toContain("no directory");
  });
});

describe("SkillService load_skill - renderer", () => {
  it("invokes a skill's custom renderer", async () => {
    const { ctx, tool } = await loadSkill(cwd, home);
    await ctx.hooks.callHook("skills:register", {
      skill: defineSkill({
        description: "Dyn",
        instructions: "static",
        name: "dyn",
        render: (runCtx) => `rendered for ${runCtx.cwd}`,
      }),
    });

    const out = await tool.execute({ name: "dyn" }, { ...ctx, cwd: "/wt" });
    expect(out.output).toContain("rendered for /wt");
  });
});

describe("SkillService lifecycle", () => {
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
