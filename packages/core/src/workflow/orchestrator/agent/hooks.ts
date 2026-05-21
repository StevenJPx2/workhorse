/** Hook subscriptions for agent lifecycle events. */
import type { Notification } from "#db";
import type { HookEmitter } from "#lib";

import type { AgentAdapter } from "./agent";

export function subscribeAgentHooks(
  hooks: HookEmitter,
  adapter: AgentAdapter,
): void {
  hooks.on(
    "notification.created",
    async ({
      notification,
      issueId,
    }: {
      notification: Notification;
      issueId: string;
    }) => {
      if (adapter.issueId !== issueId || adapter.state !== "running") return;
      await adapter
        .sendMessage(adapter.memory.notifications.generateInbox([notification]))
        .catch((err) =>
          console.error(
            `Failed to push notification to agent ${adapter.issueId}:`,
            err,
          ),
        );
    },
  );

  hooks.on(
    "steering.reminder",
    async ({ issueId, reminder }: { issueId: string; reminder: string }) => {
      if (adapter.issueId !== issueId || adapter.state !== "running") return;
      await adapter.sendMessage(reminder).catch((err) => {
        console.error(
          `Failed to deliver steering reminder to agent ${issueId}:`,
          err,
        );
      });
    },
  );
}
