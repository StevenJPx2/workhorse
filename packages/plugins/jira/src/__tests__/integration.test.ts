/**
 * Integration tests for the Jira plugin — no mocking, hits the real Atlassian API.
 *
 * Required env vars (or set JIRA_EMAIL / JIRA_API_TOKEN / JIRA_SITE_URL directly):
 *   JIRA_EMAIL        - Atlassian account email  (fallback: steven@adeptmind.ai)
 *   JIRA_API_TOKEN    - API token                (fallback: $ATLASSIAN_API_KEY)
 *   JIRA_SITE_URL     - Atlassian site hostname  (fallback: adeptmind.atlassian.net)
 *
 * Test ticket: ADEPT-37943 (read + one transient comment write)
 *
 * Run with:
 *   cd packages/plugins/jira && bun run vitest run src/__tests__/integration.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";

import { AtlassianClient } from "../client.ts";
import { mapJiraToIssue } from "../mapper.ts";
import { canParseJira, createJiraParserOptions } from "../parser.ts";

const EMAIL = process.env.JIRA_EMAIL ?? "steven@adeptmind.ai";
const API_TOKEN =
  process.env.JIRA_API_TOKEN ?? process.env.ATLASSIAN_API_KEY ?? "";
const SITE_URL = process.env.JIRA_SITE_URL ?? "adeptmind.atlassian.net";
const TICKET = "ADEPT-37943";

// Skip all tests if API token is not available (e.g., in CI)
const SKIP_INTEGRATION = !API_TOKEN;

let client: AtlassianClient;

beforeAll(() => {
  if (SKIP_INTEGRATION) return;
  client = new AtlassianClient(async () => ({
    email: EMAIL,
    apiToken: API_TOKEN,
    siteUrl: SITE_URL,
  }));
});

describe.skipIf(SKIP_INTEGRATION)("AtlassianClient.getCurrentUser", () => {
  it("authenticates and returns the current user", async () => {
    const user = await client.getCurrentUser();

    expect(user).toMatchObject({
      accountId: expect.any(String),
      displayName: expect.any(String),
    });
    console.log(`  → logged in as: ${user.displayName} (${user.accountId})`);
  });
});

describe.skipIf(SKIP_INTEGRATION)("AtlassianClient.fetchIssue", () => {
  it("fetches the real issue from Jira", async () => {
    const issue = await client.fetchIssue(TICKET);

    expect(issue.key).toBe(TICKET);
    expect(issue.self).toContain(SITE_URL);
    expect(issue.fields.summary).toBeTruthy();
    expect(issue.fields.status.name).toBeTruthy();
    console.log(`  → "${issue.fields.summary}" [${issue.fields.status.name}]`);
  });

  it("throws a descriptive error for a non-existent ticket", async () => {
    await expect(client.fetchIssue("ADEPT-99999999")).rejects.toThrow(
      /Jira API error/,
    );
  });
});

describe.skipIf(SKIP_INTEGRATION)("AtlassianClient.getTransitions", () => {
  it("returns available transitions for the issue", async () => {
    const transitions = await client.getTransitions(TICKET);

    expect(Array.isArray(transitions)).toBe(true);
    expect(transitions.length).toBeGreaterThan(0);

    for (const t of transitions) {
      expect(t).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        to: { name: expect.any(String), id: expect.any(String) },
      });
    }

    console.log(
      `  → transitions: ${transitions.map((t) => t.name).join(", ")}`,
    );
  });
});

describe.skipIf(SKIP_INTEGRATION)("AtlassianClient.addComment", () => {
  it("adds a comment to the real Jira issue", async () => {
    const body = `workhorse integration test – ${new Date().toISOString()}`;

    await expect(client.addComment(TICKET, body)).resolves.toBeUndefined();

    // Verify the comment landed (body is ADF object, search by serialised text)
    const issue = await client.fetchIssue(TICKET);
    const comments = issue.fields.comment?.comments ?? [];
    const added = comments.find((c) =>
      JSON.stringify(c.body).includes(body.slice(0, 40)),
    );
    expect(added).toBeDefined();
    console.log(`  → comment added, id=${added?.id}`);
  });
});

describe.skipIf(SKIP_INTEGRATION)("mapJiraToIssue", () => {
  it("maps the real Jira issue to a ParsedIssue", async () => {
    const jiraIssue = await client.fetchIssue(TICKET);
    const parsed = mapJiraToIssue(jiraIssue);

    expect(parsed).toMatchObject({
      externalId: TICKET,
      source: "jira",
      title: expect.any(String),
      description: expect.any(String),
      issueType: expect.any(String),
      url: expect.stringContaining("/browse/" + TICKET),
      labels: expect.any(Array),
      metadata: expect.objectContaining({
        status: expect.any(String),
      }),
    });

    console.log(`  → mapped: type=${parsed.issueType}, url=${parsed.url}`);
  });
});

describe.skipIf(SKIP_INTEGRATION)("canParseJira", () => {
  it("recognises a bare ticket key", () => {
    expect(canParseJira("ADEPT-37943")).toBe(true);
  });

  it("recognises a full Jira URL", () => {
    expect(canParseJira(`https://${SITE_URL}/browse/${TICKET}`)).toBe(true);
  });

  it("rejects plain text", () => {
    expect(canParseJira("fix the login bug")).toBe(false);
  });
});

describe.skipIf(SKIP_INTEGRATION)("createJiraParserOptions — parse()", () => {
  it("parses a ticket key into a ParsedIssue by calling the real API", async () => {
    const opts = createJiraParserOptions(client);
    const parsed = await opts.parse(TICKET);

    expect(parsed.externalId).toBe(TICKET);
    expect(parsed.source).toBe("jira");
    expect(parsed.title).toBeTruthy();
    console.log(`  → parsed title: "${parsed.title}"`);
  });

  it("parses a Jira URL into the same ParsedIssue", async () => {
    const opts = createJiraParserOptions(client);
    const parsed = await opts.parse(`https://${SITE_URL}/browse/${TICKET}`);

    expect(parsed.externalId).toBe(TICKET);
  });
});
