#!/usr/bin/env bun
/**
 * ScriptService smoke.
 *
 *   bun scripts/smoke/script.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SCRIPTS_DIR, ScriptService } from "#services";

import { context, narrator, sandbox, toolSink } from "./harness";

async function demoWrite(
  out: ReturnType<typeof narrator>,
  write: any,
  service: any,
  ctx: any,
): Promise<void> {
  out.step("write_script: greet <who> --greeting");
  await write?.execute(
    {
      args: {
        options: [{ description: "Greeting word", name: "greeting" }],
        positional: [
          { description: "Who to greet", name: "who", required: true },
        ],
      },
      command: 'echo "$GREETING, $1!"\n',
      description: "Greet someone",
      name: "greet",
    },
    ctx,
  );
  out.detail(
    "registry after write (re-scanned)",
    service.list().map((s: { name: string }) => s.name),
  );
}

async function runScriptDemo(
  out: ReturnType<typeof narrator>,
  box: ReturnType<typeof sandbox>,
): Promise<void> {
  mkdirSync(join(box.cwd, SCRIPTS_DIR), { recursive: true });
  writeFileSync(
    join(box.cwd, SCRIPTS_DIR, "ci.sh"),
    "#!/bin/sh\n# ---\n# description: Run the test suite\n# ---\necho ci-passed\n",
  );
  const ctx = context(box.cwd);
  const tools = toolSink(ctx);
  const service = new ScriptService(box.cwd, box.home);
  await service.setup(ctx);
  out.step(
    `setup scanned ${service.list().length} script(s) + contributed tools`,
  );
  out.detail("contributed tools", [...tools.keys()]);
  const run = tools.get("run_script");
  const write = tools.get("write_script");
  out.step("run_script with no name → catalog");
  out.detail(
    "catalog",
    await run?.execute({}, ctx).then((r) => r.output ?? ""),
  );
  await demoWrite(out, write, service, ctx);
  out.step("run_script greet world --greeting=Hi");
  out.detail(
    "greet output",
    await run?.execute(
      { name: "greet", options: { greeting: "Hi" }, positional: ["world"] },
      ctx,
    ),
  );
  out.step("run_script { help: true } → usage");
  out.detail(
    "greet usage",
    await run
      ?.execute({ help: true, name: "greet" }, ctx)
      .then((r) => r.output ?? ""),
  );
  out.done(`${service.name}: scan → catalog → write → run → help`);
}

export async function scriptSmoke(): Promise<void> {
  const box = sandbox();
  try {
    await runScriptDemo(narrator("ScriptService"), box);
  } finally {
    box.dispose();
  }
}

if (import.meta.main) {
  await scriptSmoke();
}
