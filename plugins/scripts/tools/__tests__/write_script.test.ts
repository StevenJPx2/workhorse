import { describe, expect, it } from "vitest";
import { fakeScript, runTool } from "@workhorse/test-utils/tools";
import write_script from "../write_script";

const valid = { name: "typecheck-all", description: "Typecheck every package", code: "return 1;" };

const write = (input: Record<string, unknown>, opts = {}) => runTool(write_script, input, opts);

describe("write_script — help", () => {
  it("returns documentation without registering anything", async () => {
    const { output, core } = await write({ help: true });

    expect(output).toContain("write_script");
    expect(output).toContain("WHEN TO SAVE");
    expect(core.callsTo("registerScript")).toHaveLength(0);
  });
});

describe("write_script — scope resolution", () => {
  it("scopes to the ticket's repo by default", async () => {
    const { core } = await write(valid, { ticket: { repo: "acme/widgets" } });

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({ scope: "repo:acme/widgets" });
  });

  it("scopes globally when asked", async () => {
    const { core } = await write({ ...valid, scope: "global" }, { ticket: { repo: "acme/widgets" } });

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({ scope: "global" });
  });

  it("falls back to global when the ticket has no repo", async () => {
    // scope:"repo" with no repo would produce the meaningless scope "repo:" —
    // global is the only coherent answer.
    const { core } = await write({ ...valid, scope: "repo" }, { ticket: { repo: undefined } });

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({ scope: "global" });
  });

  it("reports the resolved scope back to the agent", async () => {
    const { output } = await write(valid, { ticket: { repo: "acme/widgets" } });

    expect(output).toContain("repo:acme/widgets");
  });
});

describe("write_script — the registered record", () => {
  it("forwards name, description, and code verbatim", async () => {
    const { core } = await write({
      name: "build",
      description: "Build the project",
      code: "const r = await tools.bash({ command: 'bun run build' });\nreturn r;",
    });

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({
      name: "build",
      description: "Build the project",
      code: "const r = await tools.bash({ command: 'bun run build' });\nreturn r;",
    });
  });

  it("marks the author as 'agent' — humans audit these in the UI", async () => {
    const { core } = await write(valid);

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({ createdBy: "agent" });
  });

  it("defaults args and statusGates to empty arrays, never undefined", async () => {
    const { core } = await write(valid);
    const record = core.callsTo("registerScript")[0].args[0] as Record<string, unknown>;

    // The storage layer JSON-stringifies both; undefined would persist as null
    // and read back as a missing field.
    expect(record.args).toEqual([]);
    expect(record.statusGates).toEqual([]);
  });

  it("forwards declared args with their metadata", async () => {
    const args = [
      { name: "target", description: "what to build", required: true },
      { name: "verbose" },
    ];
    const { core } = await write({ ...valid, args });

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({ args });
  });

  it("forwards status gates", async () => {
    const { core } = await write({ ...valid, statusGates: ["in_review", "queued"] });

    expect(core.callsTo("registerScript")[0].args[0]).toMatchObject({ statusGates: ["in_review", "queued"] });
  });
});

describe("write_script — rejection", () => {
  it("surfaces the reason a registration was refused", async () => {
    const { output } = await write(valid, {
      core: { registerScript: async () => ({ ok: false as const, error: "name already taken by a seeded script" }) },
    });

    expect(output).toContain("write_script rejected");
    expect(output).toContain("name already taken by a seeded script");
  });

  it("does not claim success on rejection", async () => {
    const { output } = await write(valid, {
      core: { registerScript: async () => ({ ok: false as const, error: "invalid name" }) },
    });

    expect(output).not.toContain("saved");
  });
});

describe("write_script — success message", () => {
  it("names the script and points at run_script", async () => {
    const { output } = await write(valid, {
      core: { registerScript: async () => ({ ok: true as const, script: fakeScript({ name: "typecheck-all" }) }) },
    });

    expect(output).toContain('"typecheck-all" saved');
    expect(output).toContain("run_script");
  });
});
