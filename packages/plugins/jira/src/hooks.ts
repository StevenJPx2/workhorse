/**
 * Jira Plugin Hook Types
 *
 * Defines hook events emitted by the Jira plugin for cross-plugin coordination.
 * Other plugins can listen to these hooks via `ctx.hooks.on("jira:issue.transitioned", ...)`.
 *
 * Hook naming convention: `{plugin}:{entity}.{event}`
 *
 * @module @stevenjpx2/jiratown-plugin-jira/hooks
 */

/**
 * Jira plugin hook event types.
 *
 * Use module augmentation in consuming code to get type safety:
 *
 * @example
 * ```typescript
 * declare module "workhorse-core" {
 *   interface HookEventMap extends JiraPluginHooks {}
 * }
 * ```
 */
export interface JiraPluginHooks {
  /** Emitted when a Jira issue is transitioned to a new status */
  "jira:issue.transitioned": {
    issueId: string;
    from: string;
    to: string;
  };

  /** Emitted when a comment is added to a Jira issue */
  "jira:comment.added": {
    issueId: string;
    comment: {
      id: string;
      author: string;
      body: string;
    };
  };

  /** Emitted when a Jira issue is assigned to a new user */
  "jira:issue.assigned": {
    issueId: string;
    from?: string;
    to: string;
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
 * ctx.hooks.on("jira:issue.transitioned", (event: unknown) => {
 *   const { issueId, from, to } = event as JiraPluginHooks["jira:issue.transitioned"];
 * });
 * ```
 */
