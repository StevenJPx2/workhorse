import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import gh_commits from "../gh_commits";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const commits = (input: Record<string, unknown> = {}) =>
  runTool(gh_commits, input, { ticket: { repo: "acme/widgets" }, env: { GITHUB_TOKEN: "t" } });

const LIST = [
  {
    sha: "abc1234567890def",
    commit: {
      message: "fix: the login redirect loop\n\nLonger explanation that should not appear.",
      author: { name: "Alice", date: "2026-01-01T00:00:00Z" },
    },
  },
];

describe("gh_commits — help", () => {
  it("returns documentation without calling GitHub", async () => {
    const { output } = await commits({ help: true });

    expect(output).toContain("gh_commits");
    expect(output).toContain("ARGUMENTS");
  });
});

describe("gh_commits — list", () => {
  it("shortens the sha to 8 chars", async () => {
    stub = stubFetch({ "/commits": JSON.stringify(LIST) });
    const { output } = await commits();

    expect(output).toContain('"sha": "abc12345"');
    expect(output).not.toContain("abc1234567890def");
  });

  it("keeps only the SUBJECT line of the message", async () => {
    stub = stubFetch({ "/commits": JSON.stringify(LIST) });
    const { output } = await commits();

    expect(output).toContain("fix: the login redirect loop");
    // A commit list is for scanning; full bodies belong to a single-sha read.
    expect(output).not.toContain("Longer explanation");
  });

  it("includes author and date", async () => {
    stub = stubFetch({ "/commits": JSON.stringify(LIST) });
    const { output } = await commits();

    expect(output).toContain('"by": "Alice"');
    expect(output).toContain("2026-01-01");
  });

  it("filters by path and url-encodes it", async () => {
    stub = stubFetch({ "/commits": JSON.stringify(LIST) });
    await commits({ path: "src/auth handler.ts" });

    expect(stub.urls()[0]).toContain("path=src%2Fauth%20handler.ts");
  });

  it("caps the list at 15", async () => {
    stub = stubFetch({ "/commits": JSON.stringify(LIST) });
    await commits();

    expect(stub.urls()[0]).toContain("per_page=15");
  });

  it("tolerates a commit with no author", async () => {
    stub = stubFetch({ "/commits": JSON.stringify([{ sha: "deadbeefcafe", commit: {} }]) });
    const { output } = await commits();

    expect(output).toContain('"sha": "deadbeef"');
  });
});

describe("gh_commits — one commit", () => {
  const ONE = {
    commit: { message: "feat: add the thing", author: { name: "Bob", date: "2026-02-02T00:00:00Z" } },
    files: [
      { filename: "src/a.ts", additions: 10, deletions: 2 },
      { filename: "src/b.ts", additions: 0, deletions: 5 },
    ],
  };

  it("requests the single-commit endpoint", async () => {
    stub = stubFetch({ "/commits/abc1234": JSON.stringify(ONE) });
    await commits({ sha: "abc1234" });

    expect(stub.urls()[0]).toContain("/commits/abc1234");
    expect(stub.urls()[0]).not.toContain("per_page");
  });

  it("keeps the FULL message for a single commit", async () => {
    stub = stubFetch({
      "/commits/abc1234": JSON.stringify({ ...ONE, commit: { ...ONE.commit, message: "subject\n\nbody detail" } }),
    });
    const { output } = await commits({ sha: "abc1234" });

    // Unlike the list, a targeted read is where the body is the point.
    expect(output).toContain("body detail");
  });

  it("renders per-file +/- counts", async () => {
    stub = stubFetch({ "/commits/abc1234": JSON.stringify(ONE) });
    const { output } = await commits({ sha: "abc1234" });

    expect(output).toContain("src/a.ts (+10/-2)");
    expect(output).toContain("src/b.ts (+0/-5)");
  });

  it("handles a commit with no files", async () => {
    stub = stubFetch({ "/commits/abc1234": JSON.stringify({ commit: ONE.commit }) });
    const { output } = await commits({ sha: "abc1234" });

    expect(output).toContain('"files": []');
  });

  it("prefers sha over path when both are given", async () => {
    stub = stubFetch({ "/commits/abc1234": JSON.stringify(ONE) });
    await commits({ sha: "abc1234", path: "src/a.ts" });

    expect(stub.urls()[0]).not.toContain("path=");
  });
});
