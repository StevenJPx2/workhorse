/**
 * Registers hook metadata for the GitHub plugin.
 *
 * This provides documentation for hooks emitted by this plugin,
 * used by the plugin-development skill to show available hooks.
 *
 * @module workhorse-plugin-github/hook-metadata
 */
import { registerHookMetadata } from "workhorse-core";

/**
 * Register all GitHub plugin hook metadata.
 * Called during plugin setup.
 */
export function registerGitHubHookMetadata(): void {
  registerHookMetadata({
    name: "github:pr.opening",
    category: "GitHub",
    description:
      "Emitted before a PR is created, allowing plugins to contribute content sections to the PR body",
    payload:
      "{ issueId: string, title: string, body: string, base: string, head: string, draft: boolean, worktreePath: string, contributions: PRContentContribution[] }",
    plugin: "github",
    example: `ctx.hooks.on("github:pr.opening", async (event: unknown) => {
  const ctx = event as PROpeningContext;
  ctx.contributions.push({
    section: "Related Tickets",
    content: "- [PROJ-123](https://jira.example.com/browse/PROJ-123)",
    priority: 10,
  });
});`,
  });

  registerHookMetadata({
    name: "github:pr.created",
    category: "GitHub",
    description: "Emitted when a PR is created for an issue",
    payload:
      "{ issueId: string, pr: { number: number, url: string, title: string } }",
    plugin: "github",
  });

  registerHookMetadata({
    name: "github:pr.merged",
    category: "GitHub",
    description: "Emitted when a PR is merged",
    payload:
      "{ issueId: string, externalId: string, source: string, pr: { number: number, url: string, mergedBy?: string, mergedAt: string } }",
    plugin: "github",
    example: `ctx.hooks.on("github:pr.merged", async (event: unknown) => {
  const { issueId, pr } = event as GitHubPluginHooks["github:pr.merged"];
  console.log(\`PR #\${pr.number} merged for issue \${issueId}\`);
});`,
  });

  registerHookMetadata({
    name: "github:pr.closed",
    category: "GitHub",
    description: "Emitted when a PR is closed without merging",
    payload: "{ issueId: string, pr: { number: number, url: string } }",
    plugin: "github",
  });

  registerHookMetadata({
    name: "github:review.submitted",
    category: "GitHub",
    description: "Emitted when a PR review is submitted",
    payload:
      '{ issueId: string, review: { state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED", author: string, body: string } }',
    plugin: "github",
  });

  registerHookMetadata({
    name: "github:checks.passed",
    category: "GitHub",
    description: "Emitted when all CI checks pass on a PR",
    payload: "{ issueId: string, pr: { number: number } }",
    plugin: "github",
  });

  registerHookMetadata({
    name: "github:checks.failed",
    category: "GitHub",
    description: "Emitted when CI checks fail on a PR",
    payload:
      "{ issueId: string, pr: { number: number }, failedChecks: Array<{ name: string, url: string }> }",
    plugin: "github",
  });
}
