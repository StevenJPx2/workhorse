// Operator-authored agent block storage.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAgentBlock,
  getAgentBlock,
  listAgentBlocks,
  putAgentBlock,
} from "../agents";

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
