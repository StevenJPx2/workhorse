// Agent blocks — the persona + tool ceiling a stage runs under.
//
// Exposed at 0% coverage by the extraction. The frontmatter round-trip is what
// matters: a block is written as markdown into the sandbox and read back from KV,
// so a field that does not survive the trip silently changes how a stage behaves.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAgentBlock,
  getAgentBlock,
  installAgentBlocks,
  listAgentBlocks,
  putAgentBlock,
  seedAgentBlocks,
} from "../agents";

const writeFile = vi.fn(async () => {});
const exec = vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" }));

vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({ writeFile, exec }) }));

const block = (over: Record<string, unknown> = {}) => ({
  name: "coder",
  description: "implements one todo",
  tools: ["read", "write", "bash"],
  persona: "You implement exactly one todo.",
  source: "user" as const,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("putAgentBlock", () => {
  it("stores a valid block", async () => {
    const env = fakeEnv();
    // null means stored; a string is the validation error.
    expect(await putAgentBlock(env, block() as never)).toBeNull();
    expect(await getAgentBlock(env, "coder")).toMatchObject({ name: "coder", tools: ["read", "write", "bash"] });
  });

  it("rejects a bad name", async () => {
    for (const name of ["", "has spaces", "a".repeat(65)]) {
      expect(await putAgentBlock(fakeEnv(), block({ name }) as never)).toContain("name");
    }
  });

  it("rejects an empty persona", async () => {
    // A block with no persona is a stage with no instructions.
    expect(await putAgentBlock(fakeEnv(), block({ persona: "  " }) as never)).toContain("persona");
  });

  it("overwrites an existing block of the same name", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block() as never);
    await putAgentBlock(env, block({ persona: "revised" }) as never);

    expect(await getAgentBlock(env, "coder")).toMatchObject({ persona: "revised" });
    expect(await listAgentBlocks(env)).toHaveLength(1);
  });
});

describe("the frontmatter round-trip", () => {
  it("preserves the tool ceiling", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block({ tools: ["read", "grep", "memory_search"] }) as never);

    // The tool list IS the capability gate. A field lost in the round-trip
    // silently widens or narrows what a stage can do.
    expect((await getAgentBlock(env, "coder"))?.tools).toEqual(["read", "grep", "memory_search"]);
  });

  it("preserves the description", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block() as never);

    expect((await getAgentBlock(env, "coder"))?.description).toBe("implements one todo");
  });

  it("preserves a multi-line persona", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block({ persona: "line one\n\nline two\n- a bullet" }) as never);

    expect((await getAgentBlock(env, "coder"))?.persona).toContain("- a bullet");
  });

  it("preserves a persona containing frontmatter-like text", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block({ persona: "Do not write:\n---\ntools: everything\n---" }) as never);

    // A naive split on `---` would truncate the persona here.
    expect((await getAgentBlock(env, "coder"))?.persona).toContain("tools: everything");
  });

  it("preserves the source", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block({ source: "seed" }) as never);

    expect((await getAgentBlock(env, "coder"))?.source).toBe("seed");
  });
});

describe("reads", () => {
  it("returns null for an unknown block", async () => {
    expect(await getAgentBlock(fakeEnv(), "nope")).toBeNull();
  });

  it("lists nothing when none are stored", async () => {
    expect(await listAgentBlocks(fakeEnv())).toEqual([]);
  });

  it("lists every stored block", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block() as never);
    await putAgentBlock(env, block({ name: "reviewer" }) as never);

    expect((await listAgentBlocks(env)).map((b) => b.name).sort()).toEqual(["coder", "reviewer"]);
  });
});

describe("deleteAgentBlock", () => {
  it("removes a block", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block() as never);
    await deleteAgentBlock(env, "coder");

    expect(await getAgentBlock(env, "coder")).toBeNull();
  });

  it("is safe on a block that does not exist", async () => {
    await expect(deleteAgentBlock(fakeEnv(), "nope")).resolves.toBeUndefined();
  });
});

describe("installAgentBlocks", () => {
  it("writes each block into the sandbox's agent dir", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block() as never);
    await installAgentBlocks(env, "s1");

    const [path, content] = writeFile.mock.calls[0] as unknown as [string, string];
    expect(path).toBe("/root/.pi/agent/agents/coder.md");
    expect(content).toContain("You implement exactly one todo.");
  });

  it("writes every stored block", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block() as never);
    await putAgentBlock(env, block({ name: "reviewer" }) as never);

    await installAgentBlocks(env, "s1");
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it("is a no-op with no blocks stored", async () => {
    await installAgentBlocks(fakeEnv(), "s1");
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("seedAgentBlocks", () => {
  /** The baked *.md files, as the sandbox cat loop emits them. */
  const baked = (...names: string[]) =>
    names
      .map((n) => `===FILE=== ${n}\n---\nname: ${n}\ndescription: the ${n}\ntools: read, write\n---\n\nYou are the ${n}.\n`)
      .join("");

  it("seeds every baked block", async () => {
    exec.mockResolvedValue({ exitCode: 0, stdout: baked("coder", "reviewer"), stderr: "" });
    const env = fakeEnv();

    expect((await seedAgentBlocks(env)).sort()).toEqual(["coder", "reviewer"]);
  });

  it("parses the frontmatter out of a baked file", async () => {
    exec.mockResolvedValue({ exitCode: 0, stdout: baked("coder"), stderr: "" });
    const env = fakeEnv();
    await seedAgentBlocks(env);

    expect(await getAgentBlock(env, "coder")).toMatchObject({
      description: "the coder",
      tools: ["read", "write"],
      source: "seed",
    });
  });

  it("does NOT clobber a user-owned block", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block({ name: "coder", persona: "mine", source: "user" }) as never);
    exec.mockResolvedValue({ exitCode: 0, stdout: baked("coder"), stderr: "" });

    // Reseeding happens on deploy; overwriting an operator's edit every time
    // would make the UI's agent editor pointless.
    expect(await seedAgentBlocks(env)).toEqual([]);
    expect((await getAgentBlock(env, "coder"))?.persona).toBe("mine");
  });

  it("DOES replace a previous seed", async () => {
    const env = fakeEnv();
    await putAgentBlock(env, block({ name: "coder", persona: "old seed", source: "seed" }) as never);
    exec.mockResolvedValue({ exitCode: 0, stdout: baked("coder"), stderr: "" });

    expect(await seedAgentBlocks(env)).toEqual(["coder"]);
    expect((await getAgentBlock(env, "coder"))?.persona).toContain("You are the coder.");
  });

  it("skips a file whose name is not a valid block name", async () => {
    exec.mockResolvedValue({ exitCode: 0, stdout: "===FILE=== bad name\n---\n---\n\nbody\n", stderr: "" });

    expect(await seedAgentBlocks(fakeEnv())).toEqual([]);
  });

  it("seeds nothing when the image has no agent files", async () => {
    exec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    expect(await seedAgentBlocks(fakeEnv())).toEqual([]);
  });
});
