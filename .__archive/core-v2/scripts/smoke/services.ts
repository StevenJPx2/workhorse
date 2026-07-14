#!/usr/bin/env bun
/**
 * Composed services smoke.
 *
 *   bun scripts/smoke/services.ts
 */
import { ScriptService, SkillService } from "#services";

import { context, narrator, sandbox, toolSink } from "./harness";
import { mcpSmoke } from "./mcp";
import { scriptSmoke } from "./script";
import { skillSmoke } from "./skill";

if (import.meta.main) {
  await scriptSmoke();
  await skillSmoke();
  await mcpSmoke();

  const out = narrator("Composition (Script ∪ Skill ∪ MCP over one bus)");
  const box = sandbox();
  try {
    const ctx = context(box.cwd);
    const scripts = new ScriptService(box.cwd, box.home);
    const skills = new SkillService(box.cwd, box.home);
    await scripts.setup(ctx);
    await skills.setup(ctx);
    out.step("setup scripts, skills onto one shared context");
    out.detail("single tool registry, fed by every service", [
      ...toolSink(ctx).keys(),
    ]);
    out.step("teardown all (LIFO)");
    skills.teardown();
    scripts.teardown();
    out.detail("service caches after teardown", {
      scripts: scripts.list(),
      skills: skills.list(),
    });
    out.done("services compose over one bus, standalone — no Harness required");
  } finally {
    box.dispose();
  }
}
