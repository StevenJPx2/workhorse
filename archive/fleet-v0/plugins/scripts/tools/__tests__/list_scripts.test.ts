import { describe, expect, it } from "vitest";
import { fakeScript, runTool } from "@workhorse/test-utils/tools";
import list_scripts from "../list_scripts";

const list = (scripts: ReturnType<typeof fakeScript>[], ticket = {}) =>
  runTool(list_scripts, {}, { core: { listScripts: async () => scripts }, ticket });

describe("list_scripts — help", () => {
  it("returns documentation without querying", async () => {
    const { output, core } = await runTool(list_scripts, { help: true });

    expect(output).toContain("list_scripts");
    expect(output).toContain("WHEN TO USE");
    expect(core.callsTo("listScripts")).toHaveLength(0);
  });
});

describe("list_scripts — rendering", () => {
  it("renders name, args, scope, author, and description", async () => {
    const { output } = await list([
      fakeScript({
        name: "typecheck-all",
        scope: "repo:acme/widgets",
        createdBy: "agent",
        description: "Typecheck every package",
        args: [{ name: "target", required: true }],
      }),
    ]);

    expect(output).toContain("- typecheck-all(target) [repo:acme/widgets, by agent]: Typecheck every package");
  });

  it("marks optional args with ? and required args without", async () => {
    const { output } = await list([
      fakeScript({
        name: "build",
        args: [
          { name: "target", required: true },
          { name: "verbose", required: false },
          { name: "mode" },
        ],
      }),
    ]);

    // The agent has to know which args it must supply — an unmarked optional
    // arg reads as required and gets filled with a guess.
    expect(output).toContain("build(target, verbose?, mode?)");
  });

  it("renders empty parens for a script with no args", async () => {
    const { output } = await list([fakeScript({ name: "hello", args: [] })]);

    expect(output).toContain("- hello() [");
  });

  it("lists one line per script", async () => {
    const { output } = await list([
      fakeScript({ name: "a" }),
      fakeScript({ name: "b" }),
      fakeScript({ name: "c" }),
    ]);

    expect(output).toContain("- a(");
    expect(output).toContain("- b(");
    expect(output).toContain("- c(");
    expect(output.split("\n")).toHaveLength(4); // header + 3
  });

  it("distinguishes repo-scoped from global scripts", async () => {
    const { output } = await list([
      fakeScript({ name: "local", scope: "repo:acme/widgets" }),
      fakeScript({ name: "shared", scope: "global" }),
    ]);

    expect(output).toContain("[repo:acme/widgets,");
    expect(output).toContain("[global,");
  });
});

describe("list_scripts — scoping", () => {
  it("forwards the ticket's repo so the query returns repo + global", async () => {
    const { core } = await list([], { repo: "acme/widgets" });

    expect(core.callsTo("listScripts")[0].args[0]).toBe("acme/widgets");
  });

  it("passes undefined when the ticket has no repo", async () => {
    const { core } = await list([], { repo: undefined });

    expect(core.callsTo("listScripts")[0].args[0]).toBeUndefined();
  });
});

describe("list_scripts — empty inventory", () => {
  it("says so plainly rather than returning a bare header", async () => {
    const { output } = await list([]);

    expect(output).toBe("No scripts registered yet for this repo.");
  });
});
