import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import gh_pr from "../gh_pr";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const PR = {
  title: "Fix the login redirect",
  state: "open",
  merged: false,
  mergeable: true,
  base: { ref: "main" },
  head: { ref: "fix/login" },
  body: "Fixes the redirect loop.",
  html_url: "https://github.com/acme/widgets/pull/42",
  // Fields the tool deliberately drops — a PR payload is enormous.
  _links: { self: { href: "..." } },
  user: { login: "someone" },
};

const pr = (input: Record<string, unknown>, ticket = { repo: "acme/widgets" }) =>
  runTool(gh_pr, input, { ticket, env: { GITHUB_TOKEN: "gh-token" } });

describe("gh_pr — help", () => {
  it("returns documentation without calling GitHub", async () => {
    // No stub installed — a real fetch would be an unrouted crash.
    const { output } = await pr({ help: true });

    expect(output).toContain("gh_pr");
    expect(output).toContain("ARGUMENTS");
  });
});

describe("gh_pr — details (default)", () => {
  it("projects the fields that matter and DROPS the rest", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify(PR) });
    const { output } = await pr({ number: 42 });

    expect(output).toContain("Fix the login redirect");
    expect(output).toContain('"state": "open"');
    expect(output).toContain('"base": "main"');
    expect(output).toContain('"head": "fix/login"');
    // A raw PR payload is tens of KB of noise the agent must not pay for.
    // ("login" alone would false-match the PR title, so assert on the keys.)
    expect(output).not.toContain("_links");
    expect(output).not.toContain('"user"');
  });

  it("flattens base and head to their ref strings", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify(PR) });
    const { output } = await pr({ number: 42 });

    expect(output).not.toContain('"ref"');
  });

  it("reports mergeable and merged state", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify({ ...PR, merged: true, mergeable: false }) });
    const { output } = await pr({ number: 42 });

    expect(output).toContain('"merged": true');
    expect(output).toContain('"mergeable": false');
  });

  it("truncates a very long PR body", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify({ ...PR, body: "b".repeat(5000) }) });
    const { output } = await pr({ number: 42 });

    expect(output).toContain("b".repeat(2000));
    expect(output).not.toContain("b".repeat(2001));
  });

  it("renders a null body as an empty string, not the text 'null'", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify({ ...PR, body: null }) });
    const { output } = await pr({ number: 42 });

    expect(output).toContain('"body": ""');
  });

  it("treats an explicit part:details the same as omitting it", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify(PR) });
    const { output } = await pr({ number: 42, part: "details" });

    expect(output).toContain("Fix the login redirect");
  });
});

describe("gh_pr — files", () => {
  const FILES = [
    { filename: "src/auth.ts", status: "modified", additions: 12, deletions: 3, patch: "@@ -1 +1 @@\n-a\n+b" },
    { filename: "src/new.ts", status: "added", additions: 40, deletions: 0, patch: "@@ +1 @@\n+new" },
  ];

  it("requests the files subresource", async () => {
    stub = stubFetch({ "/pulls/42/files": JSON.stringify(FILES) });
    await pr({ number: 42, part: "files" });

    expect(stub.urls()[0]).toContain("/pulls/42/files");
  });

  it("renders filename, status, and a compact +/- summary", async () => {
    stub = stubFetch({ "/pulls/42/files": JSON.stringify(FILES) });
    const { output } = await pr({ number: 42, part: "files" });

    expect(output).toContain("src/auth.ts");
    expect(output).toContain('"modified"');
    expect(output).toContain('"12/3"');
    expect(output).toContain('"40/0"');
  });

  it("truncates each patch independently at 1500 chars", async () => {
    stub = stubFetch({
      "/pulls/42/files": JSON.stringify([
        { filename: "a.ts", status: "modified", additions: 1, deletions: 1, patch: "x".repeat(4000) },
        { filename: "b.ts", status: "modified", additions: 1, deletions: 1, patch: "y".repeat(4000) },
      ]),
    });
    const { output } = await pr({ number: 42, part: "files" });

    // Per-file truncation, not a single global cut — otherwise one huge file
    // would starve every file after it.
    expect(output).toContain("x".repeat(1500));
    expect(output).not.toContain("x".repeat(1501));
    expect(output).toContain("y".repeat(1500));
  });

  it("handles a file with no patch (binary or too large)", async () => {
    stub = stubFetch({
      "/pulls/42/files": JSON.stringify([{ filename: "logo.png", status: "added", additions: 0, deletions: 0 }]),
    });
    const { output } = await pr({ number: 42, part: "files" });

    expect(output).toContain("logo.png");
  });
});

describe("gh_pr — reviews and comments", () => {
  it("requests the reviews subresource and passes it through", async () => {
    const reviews = [{ user: { login: "reviewer" }, state: "CHANGES_REQUESTED", body: "Needs a test." }];
    stub = stubFetch({ "/pulls/42/reviews": JSON.stringify(reviews) });

    const { output } = await pr({ number: 42, part: "reviews" });

    expect(stub.urls()[0]).toContain("/pulls/42/reviews");
    // Reviews are passed through unprojected — this is the ACTUAL feedback a
    // revision run has to act on, so nothing is dropped.
    expect(output).toContain("CHANGES_REQUESTED");
    expect(output).toContain("Needs a test.");
  });

  it("requests the comments subresource", async () => {
    stub = stubFetch({ "/pulls/42/comments": JSON.stringify([{ body: "nit: rename this" }]) });
    const { output } = await pr({ number: 42, part: "comments" });

    expect(stub.urls()[0]).toContain("/pulls/42/comments");
    expect(output).toContain("nit: rename this");
  });
});

describe("gh_pr — repo resolution", () => {
  it("defaults to the ticket's repo", async () => {
    stub = stubFetch({ "/pulls/1": JSON.stringify(PR) });
    await pr({ number: 1 }, { repo: "acme/widgets" });

    expect(stub.urls()[0]).toContain("/repos/acme/widgets/pulls/1");
  });

  it("honors an explicit repo override", async () => {
    stub = stubFetch({ "/pulls/1": JSON.stringify(PR) });
    await pr({ number: 1, repo: "other/service" }, { repo: "acme/widgets" });

    expect(stub.urls()[0]).toContain("/repos/other/service/pulls/1");
  });

  it("throws a directive error when neither is available", async () => {
    await expect(
      runTool(gh_pr, { number: 1 }, { ticket: { repo: undefined }, env: { GITHUB_TOKEN: "t" } }),
    ).rejects.toThrow(/pass repo: owner\/name/);
  });
});

describe("gh_pr — request shape and errors", () => {
  it("authenticates and identifies itself", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify(PR) });
    await pr({ number: 42 });

    expect(stub.requests[0].headers.authorization).toBe("Bearer gh-token");
    expect(stub.requests[0].headers.accept).toBe("application/vnd.github+json");
    expect(stub.requests[0].headers["user-agent"]).toBe("workhorse");
  });

  it("hits api.github.com, not a proxy", async () => {
    stub = stubFetch({ "/pulls/42": JSON.stringify(PR) });
    await pr({ number: 42 });

    expect(stub.urls()[0].startsWith("https://api.github.com/")).toBe(true);
  });

  it("propagates a GitHub error status", async () => {
    stub = stubFetch({ "/pulls/999": { status: 404, body: '{"message":"Not Found"}' } });

    await expect(pr({ number: 999 })).rejects.toThrow(/github 404/);
  });

  it("blocks a path outside the read allowlist without any network call", async () => {
    // repoSlug is the only injection point: a slug with a slash could escape
    // the allowlisted shape.
    stub = stubFetch({}, { fallback: { status: 500 } });
    await expect(pr({ number: 42, repo: "a/b/../../user/repos" })).rejects.toThrow(/github 403|not allowed/);
    expect(stub.requested("api.github.com")).toBe(false);
  });
});
