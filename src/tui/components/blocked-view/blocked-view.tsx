/**
 * BlockedView component - Shows blocked ticket state with escalation details
 *
 * Displayed when a ticket is in "blocked" status. Shows:
 * - Warning header
 * - Questions posted to Jira
 * - Time since posted
 * - Actions: Resume, View in Jira, Cancel, Handoff
 *
 * @example
 * <BlockedView
 *   ticketId="AM-123"
 *   jiraUrl="https://company.atlassian.net/browse/AM-123"
 *   notifications={blockingNotifications}
 *   onResume={() => resumeWork(ticketId)}
 *   onViewJira={() => openBrowser(jiraUrl)}
 * />
 */

import { For, Show, createMemo } from "solid-js";
import { useTheme, spacing } from "../../theme/index.ts";
import { Button } from "../button/index.ts";
import {
  parseEscalationFromNotification,
  formatRelativeTime,
  type BlockedViewProps,
  type EscalationData,
} from "./types.ts";

/**
 * Blocked ticket view with escalation details and actions
 */
export function BlockedView(props: BlockedViewProps) {
  const { theme } = useTheme();

  // Extract escalation data from blocking notifications
  const escalations = createMemo((): EscalationData[] => {
    return props.notifications
      .filter((n) => n.priority === "blocking" && n.status !== "acknowledged")
      .map(parseEscalationFromNotification)
      .filter((e): e is EscalationData => e !== null);
  });

  // Flatten all questions from all escalations
  const allQuestions = createMemo(() => escalations().flatMap((e) => e.questions));

  // Most recent escalation time
  const latestPostedAt = createMemo(() => {
    const times = escalations().map((e) => e.postedAt);
    if (times.length === 0) return null;
    return times.sort().reverse()[0];
  });

  const hasQuestions = () => allQuestions().length > 0;
  const hasJiraUrl = () => Boolean(props.jiraUrl);

  return (
    <box
      flexDirection="column"
      border
      borderStyle="single"
      borderColor={theme().status.blocked}
      padding={spacing.sm}
      gap={spacing.sm}
    >
      {/* Header */}
      <box flexDirection="row" gap={1}>
        <text fg={theme().status.blocked}>⚠️</text>
        <text fg={theme().status.blocked}>
          <strong>Agent needs clarification</strong>
        </text>
      </box>

      {/* Questions section */}
      <Show
        when={hasQuestions()}
        fallback={<text fg={theme().text.dim}>No questions recorded. Check Jira for details.</text>}
      >
        <box flexDirection="column" gap={spacing.xs}>
          <text fg={theme().text.secondary}>Questions posted to Jira:</text>
          <box flexDirection="column" paddingLeft={spacing.md}>
            <For each={allQuestions()}>
              {(question, index) => (
                <text fg={theme().text.primary}>
                  {index() + 1}. {question}
                </text>
              )}
            </For>
          </box>
        </box>
      </Show>

      {/* Context if available */}
      <Show when={escalations()[0]?.context}>
        <box flexDirection="column" gap={spacing.xs}>
          <text fg={theme().text.secondary}>Context:</text>
          <text fg={theme().text.dim}>{escalations()[0]?.context}</text>
        </box>
      </Show>

      {/* Time since posted */}
      <Show when={latestPostedAt()}>
        <text fg={theme().text.dim}>Posted: {formatRelativeTime(latestPostedAt()!)}</text>
      </Show>

      {/* Actions */}
      <box flexDirection="row" gap={spacing.sm} marginTop={spacing.sm}>
        <Show when={hasJiraUrl()}>
          <Button label="[j] View in Jira" style="ghost" onPress={props.onViewJira} />
        </Show>
        <Button
          label={props.isResuming ? "Resuming..." : "[r] Resume"}
          variant="primary"
          onPress={props.onResume}
          disabled={props.isResuming}
        />
        <Button label="[h] Handoff" style="ghost" onPress={props.onHandoff} />
        <Button label="[c] Cancel" variant="danger" onPress={props.onCancel} />
      </box>

      {/* Keyboard hints */}
      <text fg={theme().text.dim}>
        Press [r] to resume (check for responses) | [j] to view in Jira
      </text>
    </box>
  );
}
