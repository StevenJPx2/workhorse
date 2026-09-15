import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import gh_search_code from "../gh_search_code";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const search = (input: Record<string, unknown>) =>
  runTool(gh_search_code, input, { ticket: { repo: "acme/widgets" }, env: { GITHUB_TOKEN: "t" } });

const RESULTS = {
  total_count: 42,
  items: [
    {
      repository: { full_name: "vercel/next.js" },
      path: "packages/next/src/server.ts",
      html_url: "https://github.com/vercel/next.js/blob/main/packages/next/src/server.ts",
      // Noise: text_matches can be enormous.
      text_matches: [{ fragment: "…".repeat(500) }],
      score: 1.0,
    },
  ],
};

describe("gh_search_code — help", () => {
  it("returns documentation without calling GitHub", async () => {
    const { output } = await search({ help: true });

    expect(output).toContain("gh_search_code");
    expect(output).toContain("WHEN TO USE");
  });
});

describe("gh_search_code — querying", () => {
  it("hits the code search endpoint with the query url-encoded", async () => {
    stub = stubFetch({ "/search/code": JSON.stringify(RESULTS) });
    await search({ query: "createFlueContext language:typescript" });

    expect(stub.urls()[0]).toContain("/search/code?q=createFlueContext%20language%3Atypescript");
  });

  it("caps results at 10", async () => {
    stub = stubFetch({ "/search/code": JSON.stringify(RESULTS) });
    await search({ query: "x" });

    expect(stub.urls()[0]).toContain("per_page=10");
  });

  it("reports the total match count alongside the page", async () => {
    stub = stubFetch({ "/search/code": JSON.stringify(RESULTS) });
    const { output } = await search({ query: "x" });

    // The total tells the agent whether its query was too broad to trust.
    expect(output).toContain('"total": 42');
  });

  it("projects repo, path, and url — and drops text_matches", async () => {
    stub = stubFetch({ "/search/code": JSON.stringify(RESULTS) });
    const { output } = await search({ query: "x" });

    expect(output).toContain("vercel/next.js");
    expect(output).toContain("packages/next/src/server.ts");
    expect(output).toContain("blob/main");
    // text_matches fragments can be KBs each — the URL is enough to go read it.
    expect(output).not.toContain("text_matches");
    expect(output).not.toContain('"score"');
  });

  it("handles a response with no items", async () => {
    stub = stubFetch({ "/search/code": JSON.stringify({ total_count: 0 }) });
    const { output } = await search({ query: "x" });

    expect(output).toContain('"total": 0');
    expect(output).toContain('"items": []');
  });

  it("tolerates an item with no repository", async () => {
    stub = stubFetch({
      "/search/code": JSON.stringify({ total_count: 1, items: [{ path: "a.ts", html_url: "https://x.test" }] }),
    });
    const { output } = await search({ query: "x" });

    expect(output).toContain("a.ts");
  });

  it("propagates GitHub's rate limit — search has a stricter budget than reads", async () => {
    stub = stubFetch({ "/search/code": { status: 403, body: '{"message":"rate limit exceeded"}' } });

    await expect(search({ query: "x" })).rejects.toThrow(/github 403/);
  });
});
