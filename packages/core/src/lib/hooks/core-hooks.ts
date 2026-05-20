/**
 * Core hook metadata definitions.
 *
 * This file contains the static metadata for all hooks built into workhorse-core.
 * Keep in sync with types.ts HookCallbacks.
 *
 * @module lib/hooks/core-hooks
 */

import type { HookMetadata } from "./metadata.ts";

/**
 * Core hook metadata (built into workhorse-core).
 */
export const CORE_HOOK_METADATA: HookMetadata[] = [
  // Issues
  {
    name: "issue.parsed",
    category: "Issues",
    description: "Fired after an issue is parsed from external source (URL, key, etc.)",
    payload: "{ issue: Issue, raw: unknown }",
  },
  {
    name: "issue.status_changed",
    category: "Issues",
    description: "Fired when an issue's status changes",
    payload: "{ issue: Issue, from: IssueStatus, to: IssueStatus }",
  },
  {
    name: "issue.deleted",
    category: "Issues",
    description: "Fired when an issue is deleted from the database",
    payload: "{ issue: Issue }",
  },

  // Prompts
  {
    name: "prompt.building",
    category: "Prompts",
    description:
      "Fired while building the agent prompt. Plugins can push context blocks to enrich the prompt.",
    payload:
      "{ issueId: string, contextBlocks: PromptContextBlock[], metadata: Record<string, unknown> }",
    example: `hooks.on("prompt.building", ({ contextBlocks }) => {
  contextBlocks.push({
    id: "my-context",
    title: "My Context",
    content: "Additional info for the agent",
    priority: 50,
  });
});`,
  },
  {
    name: "prompt.built",
    category: "Prompts",
    description: "Fired after the prompt is fully assembled",
    payload: "{ issueId: string, prompt: string }",
  },

  // Agent lifecycle
  {
    name: "agent.create.pre",
    category: "Agent Lifecycle",
    description: "Fired before an agent adapter is created",
    payload: "{ issue: Issue, options: CreateOptions }",
  },
  {
    name: "agent.create.post",
    category: "Agent Lifecycle",
    description: "Fired after an agent adapter is created but before it starts",
    payload: "{ adapter: AgentAdapter }",
  },
  {
    name: "agent.start.pre",
    category: "Agent Lifecycle",
    description: "Fired before an agent starts processing",
    payload: "{ adapter: AgentAdapter }",
  },
  {
    name: "agent.start.post",
    category: "Agent Lifecycle",
    description: "Fired after an agent has started and is running",
    payload: "{ adapter: AgentAdapter }",
  },
  {
    name: "agent.stop.pre",
    category: "Agent Lifecycle",
    description: "Fired before an agent is stopped",
    payload: "{ adapter: AgentAdapter }",
  },
  {
    name: "agent.stop.post",
    category: "Agent Lifecycle",
    description: "Fired after an agent has fully stopped",
    payload: "{ adapter: AgentAdapter }",
  },

  // Agent events
  {
    name: "agent.output",
    category: "Agent Events",
    description: "Fired when an agent produces text output (streaming delta)",
    payload: "{ issueId: string, delta: string }",
  },
  {
    name: "agent.tool_call",
    category: "Agent Events",
    description: "Fired when an agent invokes a tool",
    payload: "{ issueId: string, tool: string, args: unknown }",
  },
  {
    name: "agent.crashed",
    category: "Agent Events",
    description: "Fired when an agent crashes with an unrecoverable error",
    payload: "{ issueId: string, error: Error }",
  },
  {
    name: "agent.idle",
    category: "Agent Events",
    description: "Fired when an agent becomes idle (no pending work). Used by steering system.",
    payload: "{ issueId: string, status: IssueStatus, source: string }",
  },

  // Steering
  {
    name: "steering.reminder",
    category: "Steering",
    description: "Fired when a steering rule triggers a reminder message to the agent",
    payload: "{ issueId: string, reminder: string }",
  },

  // User interactions
  {
    name: "user.message",
    category: "User Interactions",
    description: "Fired when a user sends a message to an agent",
    payload: "{ issueId: string, content: string }",
  },

  // Notifications
  {
    name: "notification.created",
    category: "Notifications",
    description: "Fired when a new notification is created for an issue",
    payload: "{ notification: Notification, issueId: string }",
  },

  // Monitors
  {
    name: "monitor.registered",
    category: "Monitors",
    description: "Fired when a monitor definition is registered",
    payload: '{ name: string, type: "polling" | "event" }',
  },
  {
    name: "monitor.tick",
    category: "Monitors",
    description: "Fired when a monitor poll returns hasChanges: true",
    payload: "{ id: string, issueId: string, result: unknown }",
  },
  {
    name: "monitor.error",
    category: "Monitors",
    description: "Fired when a monitor poll throws an error. Monitors auto-stop after 5 errors.",
    payload: "{ id: string, issueId: string, error: Error, errorCount: number }",
  },

  // Plugins
  {
    name: "plugin.loaded",
    category: "Plugins",
    description: "Fired when a plugin is successfully loaded",
    payload: "{ name: string }",
  },
  {
    name: "plugin.error",
    category: "Plugins",
    description: "Fired when a plugin fails to load or errors during setup",
    payload: "{ name: string, error: Error }",
  },

  // Skills
  {
    name: "skill.registered",
    category: "Skills",
    description: "Fired when a skill is registered (from plugin or local directory)",
    payload: "{ skill: ResolvedSkill }",
  },
];
