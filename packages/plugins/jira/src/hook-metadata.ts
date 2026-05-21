/**
 * Registers hook metadata for the Jira plugin.
 *
 * This provides documentation for hooks emitted by this plugin,
 * used by the plugin-development skill to show available hooks.
 *
 * @module workhorse-plugin-jira/hook-metadata
 */
import { registerHookMetadata } from "workhorse-core";

/**
 * Register all Jira plugin hook metadata.
 * Called during plugin setup.
 */
export function registerJiraHookMetadata(): void {
  // Request hooks (trigger actions)
  registerHookMetadata({
    name: "jira:transition.requested",
    category: "Jira",
    description:
      "Request a Jira issue status transition. Consumed by Jira plugin's hook-consumers.",
    payload: "{ issueId: string, targetStatus: string, fromStatus?: string }",
    plugin: "jira",
    example: `ctx.hooks.emit("jira:transition.requested", {
  issueId: "abc123",
  targetStatus: "In Progress",
  fromStatus: "To Do",
});`,
  });

  registerHookMetadata({
    name: "jira:assign.requested",
    category: "Jira",
    description:
      "Request assignment of a Jira issue. Use 'self' to assign to current user.",
    payload: '{ issueId: string, assignee: "self" | string }',
    plugin: "jira",
  });

  // Completion hooks (notify after actions)
  registerHookMetadata({
    name: "jira:issue.transitioned",
    category: "Jira",
    description: "Emitted after a Jira issue is successfully transitioned",
    payload: "{ issueId: string, from: string, to: string }",
    plugin: "jira",
    example: `ctx.hooks.on("jira:issue.transitioned", (event: unknown) => {
  const { issueId, from, to } = event as JiraPluginHooks["jira:issue.transitioned"];
  console.log(\`Issue \${issueId} transitioned from \${from} to \${to}\`);
});`,
  });

  registerHookMetadata({
    name: "jira:issue.assigned",
    category: "Jira",
    description: "Emitted after a Jira issue is successfully assigned",
    payload: "{ issueId: string, from?: string, to: string }",
    plugin: "jira",
  });

  registerHookMetadata({
    name: "jira:comment.added",
    category: "Jira",
    description: "Emitted when a comment is added to a Jira issue",
    payload:
      "{ issueId: string, comment: { id: string, author: string, body: string } }",
    plugin: "jira",
  });
}
