import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHooks } from "hookable";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResolvedConfig } from "#config";
import type { Hooks } from "#hooks";
import type { WorkflowContext } from "#workflow";

import { defineScript } from "../define";
import type { ScriptInvocation } from "../schema";

let cwd = "";

function ctx(): WorkflowContext {
  return { config: ResolvedConfig.parse({}), cwd, hooks: createHooks<Hooks>() };
}

function invocation(over: Partial<ScriptInvocation> = {}): ScriptInvocation {
  return { options: {}, positional: [], ...over };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "wh-run-"));
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
});

describe("defineScript", () => {
  it("runs the command through just-bash and returns stdout on success", async () => {
    const script = defineScript({
      command: "echo hello",
      description: "Greet",
      name: "greet",
    });
    await expect(script.run(invocation(), ctx())).resolves.toEqual({
      ok: true,
      output: "hello\n",
    });
  });

  it("writes to the real working directory (ReadWriteFs)", async () => {
    const script = defineScript({
      command: "echo written > out.txt",
      description: "Write",
      name: "write",
    });
    await script.run(invocation(), ctx());
    expect(readFileSync(join(cwd, "out.txt"), "utf8")).toBe("written\n");
  });

  it("exposes positionals as $1.. and options as $UPPER env vars", async () => {
    const script = defineScript({
      command: 'echo "$1 $GREETING"',
      description: "Args",
      name: "args",
    });
    const result = await script.run(
      invocation({ options: { greeting: "hi" }, positional: ["world"] }),
      ctx(),
    );
    expect(result.output).toBe("world hi\n");
  });
});

describe("defineScript custom run", () => {
  it("surfaces a non-zero exit code as a failure", async () => {
    const script = defineScript({
      command: "exit 3",
      description: "Fail",
      name: "fail",
    });
    const result = await script.run(invocation(), ctx());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Script exited with code 3.");
  });
});
