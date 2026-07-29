// The per-repo memory plane — what replaces Magic Context.
//
// Two properties carry real weight: repo SCOPING (one project's conventions must
// never surface as another's) and honest failure reporting (an agent told a memory
// landed when it didn't will not record the fact anywhere else).

import { fakeAiSearch, runTool, type FakeSearchChunk } from "@workhorse/test-utils/tools";
import { describe, expect, it } from "vitest";
import memory_search from "../memory_search";
import memory_write from "../memory_write";

const REPO = "https://github.com/acme/widgets.git";

const write = (input: Record<string, unknown>, ai: ReturnType<typeof fakeAiSearch>, repo = REPO) =>
  runTool(memory_write, input, { env: { AI_SEARCH: ai }, ticket: { id: "t1", repo, stage: "implement" } });

const search = (input: Record<string, unknown>, ai: ReturnType<typeof fakeAiSearch>, repo = REPO) =>
  runTool(memory_search, input, { env: { AI_SEARCH: ai }, ticket: { id: "t1", repo, stage: "implement" } });

const hit = (over: Partial<FakeSearchChunk> = {}): FakeSearchChunk => ({
  filename: "mem/acme/widgets/2026-07-29-abc.md",
  score: 0.9,
  content: [{ text: "Releases go through scripts/release.sh" }],
  attributes: { file: { kind: "memory", repo: "acme/widgets", category: "PROJECT_RULES", ticketId: "t0" } },
  ...over,
});

describe("memory_write", () => {
  it("records a memory and says so", async () => {
    const ai = fakeAiSearch();
    const { output } = await write({ category: "PROJECT_RULES", content: "Use bun, not npm" }, ai);

    expect(output).toContain("Recorded a PROJECT_RULES memory");
    expect(ai.uploads).toHaveLength(1);
  });

  it("scopes the document by repo in both the key and the metadata", async () => {
    const ai = fakeAiSearch();
    await write({ category: "NAMING", content: "repos are owner/name" }, ai);

    // Both matter: the key groups them, the attribute filters them.
    expect(ai.uploads[0].filename).toContain("mem/acme/widgets/");
    expect(ai.uploads[0].metadata).toMatchObject({ kind: "memory", repo: "acme/widgets", category: "NAMING" });
  });

  it("records the ticket that wrote it, for provenance", async () => {
    const ai = fakeAiSearch();
    await write({ category: "CONSTRAINTS", content: "D1 baseline must stay idempotent" }, ai);

    expect(ai.uploads[0].metadata?.ticketId).toBe("t1");
  });

  it("includes the category and content in the indexed document", async () => {
    const ai = fakeAiSearch();
    await write({ category: "ARCHITECTURE", content: "the worker is the only composition root" }, ai);

    expect(ai.uploads[0].content).toContain("ARCHITECTURE");
    expect(ai.uploads[0].content).toContain("the worker is the only composition root");
  });

  it("gives the same fact the same filename, so a rewrite REPLACES", async () => {
    const ai = fakeAiSearch();
    await write({ category: "NAMING", content: "identical fact" }, ai);
    await write({ category: "NAMING", content: "identical fact" }, ai);

    // Otherwise near-duplicates accumulate and crowd out real results.
    expect(ai.uploads[0].filename).toBe(ai.uploads[1].filename);
  });

  it("gives different facts different filenames", async () => {
    const ai = fakeAiSearch();
    await write({ category: "NAMING", content: "first fact" }, ai);
    await write({ category: "NAMING", content: "second fact" }, ai);

    expect(ai.uploads[0].filename).not.toBe(ai.uploads[1].filename);
  });

  it("refuses empty content without writing", async () => {
    const ai = fakeAiSearch();
    const { output } = await write({ category: "NAMING", content: "   " }, ai);

    expect(output).toContain("content is empty");
    expect(ai.uploads).toHaveLength(0);
  });

  it("reports failure HONESTLY when the index is unavailable", async () => {
    const ai = fakeAiSearch({ uploadThrows: true });
    const { output } = await write({ category: "NAMING", content: "a fact" }, ai);

    // An agent told this succeeded would not record the fact anywhere else.
    expect(output).toContain("NOT recorded");
  });

  it("reports failure when the instance cannot be reached at all", async () => {
    const ai = fakeAiSearch({ missing: true, createFails: true });
    const { output } = await write({ category: "NAMING", content: "a fact" }, ai);

    expect(output).toContain("NOT recorded");
  });

  it("refuses when there is no repo in context", async () => {
    const ai = fakeAiSearch();
    const { output } = await write({ category: "NAMING", content: "a fact" }, ai, "");

    expect(output).toContain("no repo");
    expect(ai.uploads).toHaveLength(0);
  });
});

describe("memory_search", () => {
  it("returns matching memories with their category", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    const { output } = await search({ query: "how do releases work" }, ai);

    expect(output).toContain("PROJECT_RULES");
    expect(output).toContain("Releases go through scripts/release.sh");
  });

  it("filters by kind AND repo", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "conventions" }, ai);

    // Without the repo filter, another project's rules would surface as this
    // one's — the single worst failure this plane can have.
    const filters = JSON.stringify(ai.queries[0].filters);
    expect(filters).toContain("memory");
    expect(filters).toContain("acme/widgets");
  });

  it("shows provenance when a memory has it", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("ticket t0");
  });

  it("omits provenance when absent rather than printing undefined", async () => {
    const ai = fakeAiSearch({ results: [hit({ attributes: { file: { category: "NAMING" } } })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).not.toContain("undefined");
  });

  it("says so when nothing matches", async () => {
    const ai = fakeAiSearch({ results: [] });
    const { output } = await search({ query: "nothing" }, ai);

    expect(output).toContain("No memories recorded");
  });

  it("degrades to no results when the index is broken", async () => {
    const ai = fakeAiSearch({ searchThrows: true });
    const { output } = await search({ query: "x" }, ai);

    // A stage that cannot reach memory should still do its work.
    expect(output).toContain("No memories");
  });

  it("caps the limit at 20", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "x", limit: 500 }, ai);

    const opts = ai.queries[0].options as { retrieval?: { max_num_results?: number } };
    expect(opts.retrieval?.max_num_results).toBe(20);
  });

  it("floors the limit at 1", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "x", limit: 0 }, ai);

    expect((ai.queries[0].options as { retrieval?: { max_num_results?: number } }).retrieval?.max_num_results).toBe(1);
  });

  it("truncates a long memory", async () => {
    const ai = fakeAiSearch({ results: [hit({ content: [{ text: "z".repeat(5000) }] })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output.length).toBeLessThan(2200);
  });

  it("labels a memory with no category as UNKNOWN", async () => {
    const ai = fakeAiSearch({ results: [hit({ attributes: { file: {} } })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("UNKNOWN");
  });

  it("refuses when there is no repo in context", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    const { output } = await search({ query: "x" }, ai, "");

    expect(output).toContain("no repo");
    expect(ai.queries).toHaveLength(0);
  });
});

describe("help", () => {
  it("documents both tools without touching the index", async () => {
    for (const factory of [memory_search, memory_write]) {
      const ai = fakeAiSearch();
      const { output } = await runTool(factory, { help: true }, { env: { AI_SEARCH: ai } });

      expect(output).toContain("ARGUMENTS");
      expect(ai.queries).toHaveLength(0);
      expect(ai.uploads).toHaveLength(0);
    }
  });

  it("lists every category in memory_write's docs", async () => {
    const { output } = await runTool(memory_write, { help: true }, { env: { AI_SEARCH: fakeAiSearch() } });

    for (const c of ["PROJECT_RULES", "ARCHITECTURE", "CONSTRAINTS", "CONFIG_VALUES", "NAMING"]) {
      expect(output).toContain(c);
    }
  });
});
