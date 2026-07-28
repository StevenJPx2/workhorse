// web_search rides the provider CHAIN in ../../providers.ts, so these tests
// exercise both the tool's formatting and the chain's fallback behavior — a
// missing key, an empty result set, and a thrown request each have to advance
// to the next provider rather than fail the call.

import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import web_search from "../web_search";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const JINA_OK = JSON.stringify({
  data: [
    { title: "Valibot docs", url: "https://valibot.dev", description: "Schema validation." },
    { title: "Variant", url: "https://valibot.dev/api/variant/", description: "Discriminated unions." },
  ],
});

const TAVILY_OK = JSON.stringify({
  results: [{ title: "Tavily hit", url: "https://t.test/a", content: "from tavily" }],
});

const search = (input: Record<string, unknown>, env: Record<string, unknown>) =>
  runTool(web_search, input, { env });

describe("web_search — help", () => {
  it("returns documentation without any network call", async () => {
    // No stub installed at all: a real fetch would be an unrouted crash.
    const { output } = await search({ help: true }, {});

    expect(output).toContain("web_search");
    expect(output).toContain("Triage from the SNIPPETS");
  });
});

describe("web_search — formatting", () => {
  it("numbers results with title, url, and snippet, naming the provider", async () => {
    stub = stubFetch({ "s.jina.ai": JINA_OK });
    const { output } = await search({ query: "valibot" }, { JINA_API_KEY: "k" });

    expect(output).toContain("Results via jina:");
    expect(output).toContain("1. Valibot docs");
    expect(output).toContain("https://valibot.dev");
    expect(output).toContain("Schema validation.");
    expect(output).toContain("2. Variant");
  });

  it("url-encodes the query", async () => {
    stub = stubFetch({ "s.jina.ai": JINA_OK });
    await search({ query: "a b&c" }, { JINA_API_KEY: "k" });

    expect(stub.urls()[0]).toContain("q=a%20b%26c");
  });

  it("defaults to 8 results and honors an explicit count", async () => {
    stub = stubFetch({ "s.jina.ai": JINA_OK });
    await search({ query: "x" }, { JINA_API_KEY: "k" });
    expect(stub.urls()[0]).toContain("num=8");

    stub.restore();
    stub = stubFetch({ "s.jina.ai": JINA_OK });
    await search({ query: "x", count: 3 }, { JINA_API_KEY: "k" });
    expect(stub.urls()[0]).toContain("num=3");
  });

  it("sends the key as a bearer token and asks for snippets only", async () => {
    stub = stubFetch({ "s.jina.ai": JINA_OK });
    await search({ query: "x" }, { JINA_API_KEY: "secret-key" });

    expect(stub.requests[0].headers.authorization).toBe("Bearer secret-key");
    // Full pages come from web_read; a search must not pay for page bodies.
    expect(stub.requests[0].headers["x-respond-with"]).toBe("no-content");
  });

  it("falls back to the url as the title when a provider omits it", async () => {
    stub = stubFetch({ "s.jina.ai": JSON.stringify({ data: [{ url: "https://nameless.test" }] }) });
    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k" });

    expect(output).toContain("1. https://nameless.test");
  });

  it("truncates a long snippet to 500 chars", async () => {
    stub = stubFetch({
      "s.jina.ai": JSON.stringify({ data: [{ title: "t", url: "https://x.test", description: "d".repeat(2000) }] }),
    });
    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k" });

    expect(output).toContain("d".repeat(500));
    expect(output).not.toContain("d".repeat(501));
  });
});

describe("web_search — provider chain", () => {
  it("skips a provider with no key and uses the next configured one", async () => {
    stub = stubFetch({ "api.tavily.com": TAVILY_OK });

    // No JINA_API_KEY, so jina returns null WITHOUT making a request.
    const { output } = await search({ query: "x" }, { TAVILY_API_KEY: "k" });

    expect(output).toContain("Results via tavily:");
    expect(stub.requested("s.jina.ai")).toBe(false);
  });

  it("advances past a provider that returns a non-ok status", async () => {
    stub = stubFetch({
      "s.jina.ai": { status: 429, body: "rate limited" },
      "api.tavily.com": TAVILY_OK,
    });

    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k", TAVILY_API_KEY: "k" });

    expect(output).toContain("Results via tavily:");
    expect(stub.requested("s.jina.ai")).toBe(true);
  });

  it("advances past a provider that returns EMPTY results", async () => {
    stub = stubFetch({
      "s.jina.ai": JSON.stringify({ data: [] }),
      "api.tavily.com": TAVILY_OK,
    });

    // An empty answer is not a usable answer — the chain must keep going.
    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k", TAVILY_API_KEY: "k" });

    expect(output).toContain("Results via tavily:");
  });

  it("advances past a provider whose request THROWS", async () => {
    stub = stubFetch({
      "s.jina.ai": () => {
        throw new Error("network down");
      },
      "api.tavily.com": TAVILY_OK,
    });

    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k", TAVILY_API_KEY: "k" });

    expect(output).toContain("Results via tavily:");
  });

  it("honors SEARCH_PROVIDER as the preferred first leg", async () => {
    stub = stubFetch({ "api.exa.ai": JSON.stringify({ results: [{ url: "https://e.test", text: "exa" }] }) });

    const { output } = await search({ query: "x" }, { SEARCH_PROVIDER: "exa", EXA_API_KEY: "k", JINA_API_KEY: "k" });

    expect(output).toContain("Results via exa:");
    // Preference must reorder the chain, not merely be included in it.
    expect(stub.requested("s.jina.ai")).toBe(false);
  });

  it("ignores an unknown SEARCH_PROVIDER rather than failing", async () => {
    stub = stubFetch({ "s.jina.ai": JINA_OK });
    const { output } = await search({ query: "x" }, { SEARCH_PROVIDER: "nope", JINA_API_KEY: "k" });

    expect(output).toContain("Results via jina:");
  });

  it("reports which providers were tried when every one fails", async () => {
    stub = stubFetch({
      "s.jina.ai": { status: 500 },
      "api.tavily.com": { status: 500 },
    });

    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k", TAVILY_API_KEY: "k" });

    // The diagnostic matters: "search failed" alone leaves the agent guessing
    // whether it was a key, a quota, or an outage.
    expect(output).toContain("web_search failed");
    expect(output).toContain("jina(no key/error)");
    expect(output).toContain("tavily(no key/error)");
  });

  it("says 'none configured' when no provider has a key", async () => {
    const { output } = await search({ query: "x" }, {});

    // Every provider reports "no key/error" rather than "none configured" —
    // the chain cannot distinguish an absent key from a failed request, since
    // both surface as a null return from the provider.
    expect(output).toContain("web_search failed");
    expect(output).toContain("all providers failed");
  });
});

describe("web_search — provider response shapes", () => {
  it("maps tavily's {title,url,content}", async () => {
    stub = stubFetch({ "api.tavily.com": TAVILY_OK });
    const { output } = await search({ query: "x" }, { TAVILY_API_KEY: "k" });

    expect(output).toContain("Tavily hit");
    expect(output).toContain("from tavily");
  });

  it("maps exa's {title?,url,text} and sends the key as x-api-key", async () => {
    stub = stubFetch({
      "api.exa.ai": JSON.stringify({ results: [{ title: "Exa hit", url: "https://e.test", text: "from exa" }] }),
    });
    const { output } = await search({ query: "x" }, { EXA_API_KEY: "exa-key" });

    expect(output).toContain("Exa hit");
    expect(stub.requests[0].headers["x-api-key"]).toBe("exa-key");
  });

  it("maps brave's nested web.results and sends the subscription token", async () => {
    stub = stubFetch({
      "api.search.brave.com": JSON.stringify({
        web: { results: [{ title: "Brave hit", url: "https://b.test", description: "from brave" }] },
      }),
    });
    const { output } = await search({ query: "x" }, { BRAVE_API_KEY: "brave-key" });

    expect(output).toContain("Brave hit");
    expect(stub.requests[0].headers["x-subscription-token"]).toBe("brave-key");
  });

  it("tolerates a provider omitting its results array entirely", async () => {
    stub = stubFetch({ "s.jina.ai": "{}", "api.tavily.com": TAVILY_OK });
    const { output } = await search({ query: "x" }, { JINA_API_KEY: "k", TAVILY_API_KEY: "k" });

    expect(output).toContain("Results via tavily:");
  });
});
