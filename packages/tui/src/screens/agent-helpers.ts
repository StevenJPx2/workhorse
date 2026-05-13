/**
 * Helper functions and handlers for the Agent screen.
 *
 * Extracted from agent.tsx to stay under the 200-line limit.
 */

import type {
  AgentAdapter,
  Notification,
  HookEmitter,
  MemoryService,
  Tracker,
} from "workhorse-core";
import { useKeyboard } from "@opentui/solid";
import { getTheme } from "../theme.ts";
import { ui } from "../state/ui.ts";
import { logError } from "../state/error-log.ts";

// ─── Status helpers ───────────────────────────────────────────────────────

const statusColorMap: Record<string, string> = {
  running: getTheme().colors.success,
  starting: getTheme().colors.success,
  crashed: getTheme().colors.warning,
  stopped: getTheme().colors.error,
  stopping: getTheme().colors.error,
};
export const statusColor = (s: string) => statusColorMap[s] ?? getTheme().colors.dim;

const statusIconMap: Record<string, string> = {
  running: "●",
  starting: "◐",
  crashed: "!",
  stopped: "■",
};
export const statusIcon = (s: string) => statusIconMap[s] ?? "○";

// ─── URL helpers ──────────────────────────────────────────────────────────

/** Open a URL in the user's default browser */
function openUrl(url: string): void {
  try {
    void Bun.$`open ${url}`.quiet();
  } catch {
    console.error("Could not open URL:", url);
  }
}

// ─── BlockedView action handlers ──────────────────────────────────────────

/** Resume: check for Jira responses and continue */
export function createHandleResume(memory: MemoryService, hooks: HookEmitter) {
  return async (issueId: string | undefined) => {
    if (!issueId) return;

    try {
      // Refresh notifications to check for new responses
      const notifications = await memory.notifications.getUnread(issueId);

      // Acknowledge any blocking notifications to clear the blocked state
      const blockingIds = notifications.filter((n) => n.priority === "blocking").map((n) => n.id);

      if (blockingIds.length > 0) {
        await memory.notifications.acknowledge(blockingIds);
      }

      // Emit resume event for the agent
      hooks.emit("agent.resume", { issueId });
    } catch (err) {
      console.error("Failed to resume:", logError(err, "handleResume"));
    }
  };
}

/** Handoff: navigate back to overview so user can select a different agent */
export function handleHandoff(): void {
  ui.backToOverview();
}

/** View in Jira: open the issue URL in the user's default browser */
export function handleViewInJira(agent: AgentAdapter | undefined): void {
  const url = agent?.issue.url;
  if (url) {
    openUrl(url);
  }
}

/** Cancel: delete the ticket via tracker and return to overview */
export function createHandleCancel(tracker: Tracker) {
  return async (agent: AgentAdapter | undefined) => {
    if (!agent) return;

    try {
      // Stop the agent if running
      if (agent.state === "running" || agent.state === "starting") {
        await agent.stop();
      }

      // Delete the issue from the tracker
      await tracker.deleteIssue(agent.issue.id);

      // Return to overview
      ui.backToOverview();
    } catch (err) {
      console.error("Failed to cancel ticket:", logError(err, "handleCancel"));
    }
  };
}

/** View a notification in Jira */
export function handleViewNotificationInJira(
  notification: Notification,
  agent: AgentAdapter | undefined,
): void {
  const issueUrl = agent?.issue.url ?? (notification.metadata?.url as string | undefined);
  if (issueUrl) {
    openUrl(issueUrl);
  }
}

/** Derive the blocking message from the notifications state */
export function getBlockingMessage(notifications: Notification[]): string | undefined {
  const blocking = notifications.find((n) => n.priority === "blocking");
  return blocking?.body;
}

// ─── Keyboard shortcuts for blocked state ────────────────────────────

export const AGENT_BASE_SHORTCUTS = [
  { key: "s", action: "stop" },
  { key: "Ctrl+X M", action: "model" },
  { key: "ESC", action: "back" },
];

export const AGENT_BLOCKED_SHORTCUTS = [
  { key: "r", action: "resume" },
  { key: "h", action: "handoff" },
  { key: "v", action: "view" },
  { key: "c", action: "cancel" },
];

export const FILES_PANEL_WIDTH = 32;

interface BlockedShortcutHandlers {
  handleResume: () => void;
  onHandoff: () => void;
  onViewInJira: () => void;
  handleCancel: () => void;
}

/** Set up keyboard shortcuts for the blocked view */
export function useBlockedShortcuts(
  isBlocked: () => boolean,
  handlers: BlockedShortcutHandlers,
): void {
  useKeyboard((key) => {
    if (!isBlocked() || ui.inputMode() || ui.modal()) return;
    switch (key.name) {
      case "r":
        handlers.handleResume();
        break;
      case "h":
        handlers.onHandoff();
        break;
      case "v":
        handlers.onViewInJira();
        break;
      case "c":
        handlers.handleCancel();
        break;
    }
  });
}
