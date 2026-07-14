#!/usr/bin/env bun
/**
 * SkillService smoke.
 *
 *   bun scripts/smoke/skill.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SkillService } from "#services";

import { context, narrator, sandbox, toolSink } from "./harness";

function seedSkill(
  base: string,
  name: string,
  spec: { frontmatter: string; resources?: Record<string, string> },
): void {
  const dir = join(base, ".claude", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), spec.frontmatter);
  for (const [rel, body] of Object.entries(spec.resources ?? {})) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

async function seedAndSetup(
  out: ReturnType<typeof narrator>,
  box: ReturnType<typeof sandbox>,
): Promise<{ ctx: any; load: any; service: SkillService }> {
  seedSkill(box.cwd, "pdf-tools", {
    frontmatter:
      "---\nname: pdf-tools\ndescription: Extract and fill PDF forms.\n---\nUse pdftk for form fields. See the reference for flags.\n",
    resources: {
      "references/flags.md": "# pdftk flags\n- dump_data_fields\n- fill_form\n",
    },
  });
  const scriptsDir = join(box.cwd, ".claude", "skills", "pdf-tools", "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(
    join(scriptsDir, "extract.sh"),
    [
      "# ---",
      "# description: Extract PDF form fields",
      "# args:",
      "#   positional:",
      "#     - name: pdf",
      "#       description: PDF file path",
      "#       required: true",
      "#   options: []",
      "# ---",
      'pdftk "$1" dump_data_fields',
      "",
    ].join("\n"),
  );
  seedSkill(box.cwd, "broken", {
    frontmatter: "---\nname: broken\n---\nNo description here.\n",
  });
  out.step(
    "seeded skills: pdf-tools (valid, +1 resource, +1 script), broken (no description)",
  );

  const ctx = context(box.cwd);
  const tools = toolSink(ctx);
  const service = new SkillService(box.cwd, box.home);
  await service.setup(ctx);

  out.step(`setup discovered ${service.list().length} valid skill(s)`);
  out.detail("diagnostics", ["reported to nostics (console reporter, above)"]);
  out.detail("contributed tools", [...tools.keys()]);

  return { ctx, load: tools.get("load_skill"), service };
}

export async function skillSmoke(): Promise<void> {
  const out = narrator("SkillService");
  const box = sandbox();
  try {
    const { ctx, load, service } = await seedAndSetup(out, box);

    out.step("load_skill with no name → catalog");
    out.detail(
      "catalog",
      await load
        ?.execute({}, ctx)
        .then((r: { output?: string }) => r.output ?? ""),
    );

    out.step("load_skill { name: 'pdf-tools' } → instructions + scripts");
    out.detail(
      "loaded",
      await load
        ?.execute({ name: "pdf-tools" }, ctx)
        .then((r: { output?: string }) => r.output ?? ""),
    );

    out.step("load_skill { name, resource: 'references/flags.md' }");
    out.detail(
      "resource",
      await load
        ?.execute({ name: "pdf-tools", resource: "references/flags.md" }, ctx)
        .then((r: { output?: string }) => r.output ?? ""),
    );

    out.step("load_skill resource traversal is refused");
    out.detail(
      "guarded",
      await load?.execute(
        { name: "pdf-tools", resource: "../../etc/passwd" },
        ctx,
      ),
    );

    out.done(
      `${service.name}: discover → diagnose → catalog → load → read → scripts`,
    );
  } finally {
    box.dispose();
  }
}

if (import.meta.main) {
  await skillSmoke();
}
