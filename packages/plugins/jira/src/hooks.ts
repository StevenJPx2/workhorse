/**
 * Jira Plugin Hook Types
 *
 * Defines hook events emitted by the Jira plugin for cross-plugin coordination.
 *
 * Request hooks (*.requested) trigger actions:
 * - `jira:transition.requested` — request a status transition
 * - `jira:assign.requested` — request assignment to a user
 *
 * Completion hooks notify after actions complete:
 * - `jira:issue.transitioned` — fired after successful transition
 * - `jira:issue.assigned` — fired after successful assignment
 *
 * Hook naming convention: `{plugin}:{entity}.{event}`
 *
 * @module workhorse-plugin-jira/hooks
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
  /** Request a Jira issue transition — consumed by hook-consumers.ts */
  "jira:transition.requested": {
    issueId: string;
    /** Target Jira status name (e.g., "In Progress", "Done") */
    targetStatus: string;
    /** Original internal status for logging */
    fromStatus?: string;
  };

  /** Request assignment of a Jira issue — consumed by hook-consumers.ts */
  "jira:assign.requested": {
    issueId: string;
    /** "self" to assign to current user, or an accountId */
    assignee: "self" | string;
  };

  /** Emitted after a Jira issue is successfully transitioned */
  "jira:issue.transitioned": {
    issueId: string;
    from: string;
    to: string;
  };

  /** Emitted after a Jira issue is successfully assigned */
  "jira:issue.assigned": {
    issueId: string;
    from?: string;
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
