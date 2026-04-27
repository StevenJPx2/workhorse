/**
 * GitHub Plugin Hook Types
 *
 * Defines hook events emitted by the GitHub plugin for cross-plugin coordination.
 * Other plugins can listen to these hooks via `ctx.hooks.on("github:pr.merged", ...)`.
 *
 * Hook naming convention: `{plugin}:{entity}.{event}`
 *
 * @module @jiratown/plugin-github/hooks
 */

/**
 * GitHub plugin hook event types.
 *
 * Use module augmentation in consuming code to get type safety:
 *
 * @example
 * ```typescript
 * declare module "@jiratown/core" {
 *   interface HookEventMap extends GitHubPluginHooks {}
 * }
 * ```
 */
export interface GitHubPluginHooks {
  /** Emitted when a PR is created for an issue */
  "github:pr.created": {
    issueId: string;
    pr: {
      number: number;
      url: string;
      title: string;
    };
  };

  /** Emitted when a PR is merged */
  "github:pr.merged": {
    /** Internal issue ID (for database lookup via getById) */
    issueId: string;
    /** External ID (e.g., "owner/repo#123" for GitHub issues) */
    externalId: string;
    /** Issue source (e.g., "github", "jira") */
    source: string;
    pr: {
      number: number;
      url: string;
      mergedBy?: string;
      mergedAt: string;
    };
  };

  /** Emitted when a PR is closed without merging */
  "github:pr.closed": {
    issueId: string;
    pr: {
      number: number;
      url: string;
    };
  };

  /** Emitted when a PR review is submitted */
  "github:review.submitted": {
    issueId: string;
    review: {
      state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
      author: string;
      body: string;
    };
  };

  /** Emitted when all CI checks pass */
  "github:checks.passed": {
    issueId: string;
    pr: {
      number: number;
    };
  };

  /** Emitted when CI checks fail */
  "github:checks.failed": {
    issueId: string;
    pr: {
      number: number;
    };
    failedChecks: Array<{
      name: string;
      url: string;
    }>;
  };
}

/**
 * Note on type safety:
 *
 * The core HookEventMap uses `Record<string, unknown>` to allow custom hook names.
 * Since it's a type alias (not interface), module augmentation doesn't work.
 *
 * For type-safe hook handling in listeners, cast the event payload:
 * ```typescript
 * ctx.hooks.on("github:pr.merged", (event: unknown) => {
 *   const { issueId, pr } = event as GitHubPluginHooks["github:pr.merged"];
 * });
 * ```
 */
