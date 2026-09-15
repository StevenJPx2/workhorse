import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import gh_issue from "../gh_issue";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const issue = (input: Record<string, unknown>) =>
  runTool(gh_issue, input, { ticket: { repo: "acme/widgets" }, env: { GITHUB_TOKEN: "t" } });

const ISSUE = {
  title: "Login redirect loops",
  state: "open",
  labels: [{ name: "bug" }, { name: "priority:high" }],
  body: "Steps to reproduce: ...",
  html_url: "https://github.com/acme/widgets/issues/17",
  assignee: { login: "someone" },
  reactions: { "+1": 3 },
};

describe("gh_issue — help", () => {
  it("returns documentation without calling GitHub", async () => {
    const { output } = await issue({ help: true });

    expect(output).toContain("gh_issue");
    expect(output).toContain("ARGUMENTS");
  });
});

describe("gh_issue — the issue body", () => {
  it("projects title, state, labels, body, and url", async () => {
    stub = stubFetch({ "/issues/17": JSON.stringify(ISSUE) });
    const { output } = await issue({ number: 17 });

    expect(output).toContain("Login redirect loops");
    expect(output).toContain('"state": "open"');
    expect(output).toContain("Steps to reproduce");
    expect(output).toContain("issues/17");
  });

  it("flattens labels to bare names", async () => {
    stub = stubFetch({ "/issues/17": JSON.stringify(ISSUE) });
    const { output } = await issue({ number: 17 });

    expect(output).toContain("bug");
    expect(output).toContain("priority:high");
    // Label objects carry color/description/id the agent has no use for.
    expect(output).not.toContain('"color"');
  });

  it("drops fields the agent does not need", async () => {
    stub = stubFetch({ "/issues/17": JSON.stringify(ISSUE) });
    const { output } = await issue({ number: 17 });

    expect(output).not.toContain("reactions");
    expect(output).not.toContain("assignee");
  });

  it("truncates a long body at 3000 chars", async () => {
    stub = stubFetch({ "/issues/17": JSON.stringify({ ...ISSUE, body: "b".repeat(6000) }) });
    const { output } = await issue({ number: 17 });

    expect(output).toContain("b".repeat(3000));
    expect(output).not.toContain("b".repeat(3001));
  });

  it("renders a null body as empty rather than the text 'null'", async () => {
    stub = stubFetch({ "/issues/17": JSON.stringify({ ...ISSUE, body: null }) });
    const { output } = await issue({ number: 17 });

    expect(output).toContain('"body": ""');
  });

  it("tolerates an issue with no labels", async () => {
    stub = stubFetch({ "/issues/17": JSON.stringify({ ...ISSUE, labels: undefined }) });
    const { output } = await issue({ number: 17 });

    expect(output).toContain("Login redirect loops");
  });
});

describe("gh_issue — the comment thread", () => {
  const COMMENTS = [
    { user: { login: "alice" }, created_at: "2026-01-01T00:00:00Z", body: "This is the real requirement." },
    { user: { login: "bob" }, created_at: "2026-01-02T00:00:00Z", body: "Agreed." },
  ];

  it("requests the comments subresource", async () => {
    stub = stubFetch({ "/issues/17/comments": JSON.stringify(COMMENTS) });
    await issue({ number: 17, comments: true });

    expect(stub.urls()[0]).toContain("/issues/17/comments");
  });

  it("renders author, timestamp, and body per comment", async () => {
    stub = stubFetch({ "/issues/17/comments": JSON.stringify(COMMENTS) });
    const { output } = await issue({ number: 17, comments: true });

    expect(output).toContain('"by": "alice"');
    expect(output).toContain("This is the real requirement.");
    expect(output).toContain('"by": "bob"');
  });

  it("truncates each comment at 1200 chars independently", async () => {
    stub = stubFetch({
      "/issues/17/comments": JSON.stringify([
        { user: { login: "a" }, created_at: "x", body: "p".repeat(3000) },
        { user: { login: "b" }, created_at: "y", body: "q".repeat(3000) },
      ]),
    });
    const { output } = await issue({ number: 17, comments: true });

    expect(output).toContain("p".repeat(1200));
    expect(output).not.toContain("p".repeat(1201));
    expect(output).toContain("q".repeat(1200));
  });

  it("tolerates a comment with no user", async () => {
    stub = stubFetch({ "/issues/17/comments": JSON.stringify([{ created_at: "x", body: "orphan" }]) });
    const { output } = await issue({ number: 17, comments: true });

    expect(output).toContain("orphan");
  });

  it("handles an empty thread", async () => {
    stub = stubFetch({ "/issues/17/comments": "[]" });
    const { output } = await issue({ number: 17, comments: true });

    expect(output).toBe("[]");
  });
});
