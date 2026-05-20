/**
 * Activity row components - main dispatcher and common rows.
 */

import { Match, Switch } from "solid-js";

import type { ActivityItem } from "../primitives/activity-types.ts";
import { getTheme } from "../theme.ts";
import { ActivityRow } from "./activity-row.tsx";

/** Main dispatcher - renders the right row type for each activity item */
export function ActivityItemRow(props: { item: ActivityItem }) {
  return (
    <Switch>
      <Match when={props.item.type === "text"}>
        <TextBubbleRow item={props.item as ActivityItem & { type: "text" }} />
      </Match>
      <Match when={props.item.type === "tool"}>
        <ActivityRow
          input={{
            kind: "tool",
            tool: (props.item as ActivityItem & { type: "tool" }).tool,
            args: (props.item as ActivityItem & { type: "tool" }).args,
          }}
        />
      </Match>
      <Match when={props.item.type === "notification"}>
        <ActivityRow
          input={{
            kind: "notification",
            notification: (props.item as ActivityItem & { type: "notification" }).notification,
          }}
        />
      </Match>
      <Match when={props.item.type === "steering"}>
        <SteeringRow item={props.item as ActivityItem & { type: "steering" }} />
      </Match>
      <Match when={props.item.type === "idle"}>
        <IdleRow timestamp={props.item.timestamp} />
      </Match>
      <Match when={props.item.type === "user_message"}>
        <UserMessageRow item={props.item as ActivityItem & { type: "user_message" }} />
      </Match>
    </Switch>
  );
}

/** Text output bubble from agent */
function TextBubbleRow(props: { item: ActivityItem & { type: "text" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="column" marginBottom={1}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.success}>
          <b>Agent</b>
        </text>
        <text fg={theme.colors.dim}>{formatTime(props.item.timestamp)}</text>
      </box>
      <box backgroundColor={theme.colors.surface} paddingLeft={1} paddingRight={1}>
        <text fg={theme.colors.text}>{props.item.content}</text>
      </box>
    </box>
  );
}

/** Steering rule reminder - outlined box */
function SteeringRow(props: { item: ActivityItem & { type: "steering" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="column" marginY={1}>
      <box flexDirection="row" gap={1} paddingLeft={1}>
        <text fg={theme.colors.info}>🎯</text>
        <text fg={theme.colors.info}>
          <b>Steering</b>
        </text>
        <text fg={theme.colors.dim}>{formatTime(props.item.timestamp)}</text>
      </box>
      <box borderStyle="rounded" borderColor={theme.colors.info} marginLeft={2} paddingX={1}>
        <text fg={theme.colors.text}>
          <i>{truncate(props.item.reminder, 80)}</i>
        </text>
      </box>
    </box>
  );
}

/** User message bubble - aligned to the right */
function UserMessageRow(props: { item: ActivityItem & { type: "user_message" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="column" marginBottom={1} alignItems="flex-end">
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.dim}>{formatTime(props.item.timestamp)}</text>
        <text fg={theme.colors.accent}>
          <b>You</b>
        </text>
      </box>
      <box backgroundColor={theme.colors.selection} paddingLeft={1} paddingRight={1}>
        <text fg={theme.colors.info}>{props.item.content}</text>
      </box>
    </box>
  );
}

/** Idle/pause separator */
function IdleRow(props: { timestamp: Date }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1} marginTop={1}>
      <text fg={theme.colors.dim}>───</text>
      <text fg={theme.colors.dim}>
        <i>paused</i>
      </text>
      <text fg={theme.colors.dim}>{formatTime(props.timestamp)}</text>
      <text fg={theme.colors.dim}>───</text>
    </box>
  );
}

/** Format timestamp as HH:MM:SS */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 3) + "...";
}
