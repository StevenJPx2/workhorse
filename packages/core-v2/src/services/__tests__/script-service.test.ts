import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyTool } from "#schema";

import { SCRIPTS_DIR, ScriptService } from "../script";
import { context } from "./fixture";

let cwd = "";

function writeScript(name: string, body: string): void {
  const dir = join(cwd, SCRIPTS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.sh`), body);
}

async function contributedTools(ctx = context()) {
  const registered = vi.fn();
  ctx.hooks.hook("tools:register", registered);
  const service = new ScriptService(cwd);
  await service.setup(ctx);

  const tools = new Map<string, AnyTool>(
    registered.mock.calls.flatMap(([p]) =>
      (p.tools as AnyTool[]).map((tool) => [tool.name, tool]),
    ),
  );
  return { ctx, service, tools };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "workhorse-scripts-"));
  mkdirSync(join(cwd, SCRIPTS_DIR), { recursive: true });
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
  vi.restoreAllMocks();
});

describe("ScriptService", () => {
  it("scans .workhorse/scripts once on setup, reading the front-matter description", async () => {
    writeScript(
      "ci",
      "#!/bin/sh\n# ---\n# description: Run the suite\n# ---\necho hi\n",
    );
    const service = new ScriptService(cwd);
    await service.setup(context());

    const [script] = service.list();
    expect(script?.name).toBe("ci");
    expect(script?.description).toBe("Run the suite");
  });

  it("returns the cached list without re-scanning disk", async () => {
    writeScript("a", "echo a\n");
    const service = new ScriptService(cwd);
    await service.setup(context());

    writeScript("b", "echo b\n");
    expect(service.list().map((s) => s.name)).toEqual(["a"]);
  });

  it("lists nothing when the scripts directory is empty", async () => {
    const service = new ScriptService(cwd);
    await service.setup(context());
    expect(service.list()).toEqual([]);
  });

  it("clears the cache on teardown", async () => {
    writeScript("a", "echo a\n");
    const service = new ScriptService(cwd);
    await service.setup(context());
    service.teardown();
    expect(service.list()).toEqual([]);
  });
});

describe("ScriptService diagnostics", () => {
  it("reports WH_SCRIPT_INVALID for malformed scripts on setup", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    writeScript(
      "bad",
      "# ---\n# description: Bad\n# args: oops\n# ---\necho hi\n",
    );

    await new ScriptService(cwd).setup(context());

    expect(error.mock.calls.flat().join("\n")).toContain("WH_SCRIPT_INVALID");
  });
});

describe("ScriptService tools", () => {
  it("run_script lists, then runs, the registry", async () => {
    writeScript(
      "ci",
      "#!/bin/sh\n# ---\n# description: Run the suite\n# ---\necho ran-ci\n",
    );
    const { ctx, tools } = await contributedTools();
    const runCtx = { ...ctx, cwd };

    await expect(tools.get("run_script")?.execute({}, runCtx)).resolves.toEqual(
      {
        ok: true,
        output: "- **ci**: Run the suite",
      },
    );
    const ran = await tools.get("run_script")?.execute({ name: "ci" }, runCtx);
    expect(ran?.ok).toBe(true);
    expect(ran?.output).toContain("ran-ci");
    await expect(
      tools.get("run_script")?.execute({ name: "nope" }, runCtx),
    ).resolves.toEqual({
      error: 'No script named "nope".',
      ok: false,
    });
  });

  it("run_script with no name reports an empty registry", async () => {
    const { ctx, tools } = await contributedTools();
    await expect(
      tools.get("run_script")?.execute({}, { ...ctx, cwd }),
    ).resolves.toEqual({
      ok: true,
      output: "No scripts are available.",
    });
  });
});

describe("ScriptService write_script", () => {
  it("saves a .sh and refreshes the cache so it is runnable", async () => {
    const { ctx, service, tools } = await contributedTools();
    const runCtx = { ...ctx, cwd };

    await expect(
      tools
        .get("write_script")
        ?.execute(
          { command: "echo built\n", description: "Build it", name: "build" },
          runCtx,
        ),
    ).resolves.toEqual({ ok: true, output: 'Saved script "build".' });

    expect(readFileSync(join(cwd, SCRIPTS_DIR, "build.sh"), "utf8")).toBe(
      "# ---\n# description: Build it\n# ---\necho built",
    );
    expect(service.list().find((s) => s.name === "build")?.description).toBe(
      "Build it",
    );
    const ran = await tools
      .get("run_script")
      ?.execute({ name: "build" }, runCtx);
    expect(ran?.output).toContain("built");
  });
});

describe("ScriptService write_script args", () => {
  it("persists an args contract that round-trips through discovery", async () => {
    const { ctx, service, tools } = await contributedTools();
    const args = {
      options: [{ description: "Verbose", name: "verbose" }],
      positional: [{ description: "Target", name: "target", required: true }],
    };
    await tools
      .get("write_script")
      ?.execute(
        { args, command: "echo $1\n", description: "Go", name: "go" },
        { ...ctx, cwd },
      );

    const reloaded = service.list().find((s) => s.name === "go");
    expect(reloaded?.args.positional[0]?.name).toBe("target");
    expect(reloaded?.args.options[0]?.name).toBe("verbose");
  });
});

describe("ScriptService help", () => {
  it("run_script with help: true renders a script's usage", async () => {
    writeScript(
      "deploy",
      [
        "# ---",
        "# description: Deploy",
        "# args:",
        "#   positional:",
        "#     - name: env",
        "#       description: Target env",
        "#       required: true",
        "#   options: []",
        "# ---",
        "echo deploy",
        "",
      ].join("\n"),
    );
    const { ctx, tools } = await contributedTools();
    const help = await tools
      .get("run_script")
      ?.execute({ help: true, name: "deploy" }, { ...ctx, cwd });
    expect(help?.output).toContain("Usage: deploy <env>");
    expect(help?.output).toContain("env (required) — Target env");
  });

  it("run_script with help: true returns usage instead of running", async () => {
    writeScript("noop", "# ---\n# description: Noop\n# ---\necho noop\n");
    const { ctx, tools } = await contributedTools();
    const result = await tools
      .get("run_script")
      ?.execute({ help: true, name: "noop" }, { ...ctx, cwd });
    expect(result?.output).toContain("Usage: noop");
  });

  it("run_script with help: true errors for an unknown script", async () => {
    const { ctx, tools } = await contributedTools();
    await expect(
      tools
        .get("run_script")
        ?.execute({ help: true, name: "nope" }, { ...ctx, cwd }),
    ).resolves.toEqual({ error: 'No script named "nope".', ok: false });
  });
});

describe("ScriptService run with args", () => {
  it("run_script passes positionals and options to the script body", async () => {
    writeScript(
      "greet",
      [
        "# ---",
        "# description: Greet",
        "# args:",
        "#   positional:",
        "#     - name: who",
        "#       description: Name",
        "#   options:",
        "#     - name: greeting",
        "#       description: Greeting",
        "# ---",
        'echo "$1 $GREETING"',
        "",
      ].join("\n"),
    );
    const { ctx, tools } = await contributedTools();
    const ran = await tools
      .get("run_script")
      ?.execute(
        { name: "greet", options: { greeting: "hi" }, positional: ["world"] },
        { ...ctx, cwd },
      );
    expect(ran?.output).toBe("world hi\n");
  });
});
