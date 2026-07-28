import { describe, expect, it, vi } from "vitest";
import { fakeAiSearch, runTool, type FakeSearchChunk } from "@workhorse/test-utils/tools";
import search_fleet_knowledge from "../search_fleet_knowledge";

/** Run the tool against a scripted AI Search binding. */
const search = (input: Record<string, unknown>, ai: ReturnType<typeof fakeAiSearch>) =>
  runTool(search_fleet_knowledge, input, { env: { AI_SEARCH: ai } });

const hit = (over: Partial<FakeSearchChunk> = {}): FakeSearchChunk => ({
  filename: "t-abc-run1.md",
  score: 0.87,
  content: [{ text: "The sandbox lost node_modules mid-run." }],
  attributes: { file: { ticketId: "t-abc", repo: "acme/widgets" } },
  ...over,
});

describe("search_fleet_knowledge — help", () => {
  it("returns documentation without querying the index", async () => {
    const ai = fakeAiSearch();
    const { output } = await search({ help: true }, ai);

    expect(output).toContain("institutional memory");
    expect(output).toContain("WHEN TO USE");
    expect(ai.queries).toHaveLength(0);
  });
});

describe("search_fleet_knowledge — querying", () => {
  it("formats hits with rank, source, repo, and score", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    const { output } = await search({ query: "node_modules" }, ai);

    expect(output).toContain("### 1. t-abc-run1.md");
    expect(output).toContain("(acme/widgets)");
    expect(output).toContain("score 0.87");
    expect(output).toContain("The sandbox lost node_modules mid-run.");
  });

  it("numbers multiple hits and separates them", async () => {
    const ai = fakeAiSearch({
      results: [hit({ filename: "a.md" }), hit({ filename: "b.md" }), hit({ filename: "c.md" })],
    });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("### 1. a.md");
    expect(output).toContain("### 2. b.md");
    expect(output).toContain("### 3. c.md");
    expect(output.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });

  it("joins multi-part chunk content", async () => {
    const ai = fakeAiSearch({ results: [hit({ content: [{ text: "first" }, { text: "second" }] })] });
    const { output } = await search({ query: "x" }, ai);

    // Content arrives as an array of parts; concatenating with a space would
    // lose the line structure the agent reads.
    expect(output).toContain("first\nsecond");
  });

  it("passes the query through and defaults to 6 results", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "why did the build fail" }, ai);

    expect(ai.queries[0].query).toBe("why did the build fail");
    expect(ai.queries[0].options).toMatchObject({ retrieval: { max_num_results: 6 } });
  });

  it("honors an explicit limit", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "x", limit: 3 }, ai);

    expect(ai.queries[0].options).toMatchObject({ retrieval: { max_num_results: 3 } });
  });

  it("clamps the limit to 1..20", async () => {
    const high = fakeAiSearch({ results: [hit()] });
    await search({ query: "x", limit: 500 }, high);
    expect(high.queries[0].options).toMatchObject({ retrieval: { max_num_results: 20 } });

    const low = fakeAiSearch({ results: [hit()] });
    await search({ query: "x", limit: 0 }, low);
    expect(low.queries[0].options).toMatchObject({ retrieval: { max_num_results: 1 } });
  });

  it("truncates the query at 500 chars — a pasted stack trace must not blow the request", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "e".repeat(2000) }, ai);

    expect(ai.queries[0].query).toHaveLength(500);
  });

  it("requests context expansion so a hit carries surrounding text", async () => {
    const ai = fakeAiSearch({ results: [hit()] });
    await search({ query: "x" }, ai);

    expect(ai.queries[0].options).toMatchObject({ retrieval: { context_expansion: 1 } });
  });

  it("truncates a very long hit body", async () => {
    const ai = fakeAiSearch({ results: [hit({ content: [{ text: "z".repeat(5000) }] })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("z".repeat(2500));
    expect(output).not.toContain("z".repeat(2501));
  });
});

describe("search_fleet_knowledge — missing metadata", () => {
  it("omits the repo suffix when the hit has none", async () => {
    const ai = fakeAiSearch({ results: [hit({ attributes: { file: {} } })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("### 1. t-abc-run1.md");
    expect(output).not.toContain("(");
  });

  it("omits the score when absent — 0 is a real score and must still print", async () => {
    const none = fakeAiSearch({ results: [hit({ score: undefined })] });
    expect((await search({ query: "x" }, none)).output).not.toContain("score");

    const zero = fakeAiSearch({ results: [hit({ score: 0 })] });
    expect((await search({ query: "x" }, zero)).output).toContain("score 0.00");
  });

  it("falls back to 'unknown' when no filename is present", async () => {
    const ai = fakeAiSearch({ results: [hit({ filename: undefined, attributes: { file: {} } })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("### 1. unknown");
  });

  it("handles a hit with no content array", async () => {
    const ai = fakeAiSearch({ results: [hit({ content: undefined })] });
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("### 1. t-abc-run1.md");
  });
});

describe("search_fleet_knowledge — no results is a real answer", () => {
  it("says so plainly on an empty index", async () => {
    const ai = fakeAiSearch({ results: [] });
    const { output } = await search({ query: "x" }, ai);

    // Phrased as a finding, not an error: the agent should proceed on first
    // principles rather than re-query with variations.
    expect(output).toContain("No fleet knowledge hits");
    expect(output).toContain("novel territory");
  });

  it("creates the instance on first use, then searches it", async () => {
    const ai = fakeAiSearch({ missing: true, results: [hit()] });
    const { output } = await search({ query: "x" }, ai);

    expect(ai.creates).toHaveLength(1);
    // Hybrid indexing is load-bearing: verbatim identifiers (file paths, error
    // strings) need keyword hits, conceptual queries need vectors.
    expect(ai.creates[0]).toMatchObject({ index_method: { vector: true, keyword: true } });
    expect(output).toContain("t-abc-run1.md");
  });

  it("degrades to no-results when the index cannot be created", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ai = fakeAiSearch({ missing: true, createFails: true });

    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("No fleet knowledge hits");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("degrades to no-results when the search itself throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ai = fakeAiSearch({ searchThrows: true });

    // Knowledge lookup is advisory: a broken index must never fail the stage.
    const { output } = await search({ query: "x" }, ai);

    expect(output).toContain("No fleet knowledge hits");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("degrades to no-results when the binding is absent entirely", async () => {
    const { output } = await runTool(search_fleet_knowledge, { query: "x" }, { env: { AI_SEARCH: undefined } });
    expect(output).toContain("No fleet knowledge hits");
  });
});

describe("search_fleet_knowledge — surfaces", () => {
  it("is available to BOTH stages and the operator chat", () => {
    // surfaces is declared on the FACTORY (tool() sets factory.surfaces), not
    // on the built definition — the composition root reads it before building.
    expect(search_fleet_knowledge.surfaces).toEqual(["stage", "chat"]);
  });
});
