/**
 * Tool-specific activity row components.
 * Read, Write, Bash, Grep, Glob, and generic tool rows.
 */

import type { ActivityItem } from "../primitives/activity-types.ts";
import { getTheme } from "../theme.ts";

/** Read file tool */
export function ReadRow(props: { item: ActivityItem & { type: "tool_read" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.colors.info}>📖</text>
      <text fg={theme.colors.dim}>read</text>
      <text fg={theme.colors.text}>{shortenPath(props.item.path)}</text>
    </box>
  );
}

/** Write/Edit file tool */
export function WriteRow(props: { item: ActivityItem & { type: "tool_write" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={props.item.action === "create" ? theme.colors.success : theme.colors.warning}>
        {props.item.action === "create" ? "📄" : "✏️"}
      </text>
      <text fg={props.item.action === "create" ? theme.colors.success : theme.colors.warning}>
        {props.item.action}
      </text>
      <text fg={theme.colors.text}>{shortenPath(props.item.path)}</text>
    </box>
  );
}

/** Bash command tool */
export function BashRow(props: { item: ActivityItem & { type: "tool_bash" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.colors.accent}>$</text>
      <text fg={theme.colors.text}>
        {props.item.description || truncate(props.item.command, 50)}
      </text>
    </box>
  );
}

/** Grep search tool */
export function GrepRow(props: { item: ActivityItem & { type: "tool_grep" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.colors.info}>🔍</text>
      <text fg={theme.colors.dim}>grep</text>
      <text fg={theme.colors.accent}>{truncate(props.item.pattern, 40)}</text>
    </box>
  );
}

/** Glob file search tool */
export function GlobRow(props: { item: ActivityItem & { type: "tool_glob" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.colors.info}>📂</text>
      <text fg={theme.colors.dim}>glob</text>
      <text fg={theme.colors.accent}>{truncate(props.item.pattern, 40)}</text>
    </box>
  );
}

/** Jiratown tool (status, escalate, acknowledge) */
export function JiratownRow(props: { item: ActivityItem & { type: "tool_jiratown" } }) {
  const theme = getTheme();
  const item = props.item;

  if (item.action === "status") {
    return (
      <box flexDirection="row" paddingLeft={1} gap={1}>
        <text fg={theme.colors.accent}>⚡</text>
        <text fg={theme.colors.dim}>status →</text>
        <text fg={getStatusColor(item.status, theme)}>
          <b>{item.status}</b>
        </text>
      </box>
    );
  }

  if (item.action === "escalate") {
    return (
      <box flexDirection="column" marginY={1}>
        <box flexDirection="row" paddingLeft={1} gap={1}>
          <text fg={item.blocking ? theme.colors.error : theme.colors.warning}>🚨</text>
          <text fg={item.blocking ? theme.colors.error : theme.colors.warning}>
            <b>{item.blocking ? "BLOCKED" : "escalate"}</b>
          </text>
        </box>
        <box borderStyle="rounded" borderColor={theme.colors.warning} marginLeft={2} paddingX={1}>
          <text fg={theme.colors.text}>{truncate(item.message, 60)}</text>
        </box>
      </box>
    );
  }

  // acknowledge
  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.colors.success}>✓</text>
      <text fg={theme.colors.dim}>acknowledged notifications</text>
    </box>
  );
}

/** Other/unknown tool call */
export function OtherToolRow(props: { item: ActivityItem & { type: "tool_other" } }) {
  const theme = getTheme();

  return (
    <box flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.colors.warning}>⚡</text>
      <text fg={theme.colors.accent}>
        <b>{props.item.tool}</b>
      </text>
      <text fg={theme.colors.dim}>{formatArgs(props.item.args)}</text>
    </box>
  );
}

/** Get color for issue status */
function getStatusColor(status: string, theme: ReturnType<typeof getTheme>): string {
  switch (status) {
    case "done":
      return theme.colors.success;
    case "blocked":
      return theme.colors.error;
    case "in_review":
      return theme.colors.warning;
    case "implementing":
    case "planning":
      return theme.colors.info;
    default:
      return theme.colors.dim;
  }
}

/** Format tool args for display (truncated) */
function formatArgs(args: unknown): string {
  if (!args) return "";
  try {
    const str = JSON.stringify(args);
    return str.length > 40 ? str.slice(0, 37) + "..." : str;
  } catch {
    return "[...]";
  }
}

/** Shorten file path for display */
function shortenPath(path: string): string {
  if (path.length <= 35) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path.slice(-35);
  return `.../${parts.slice(-2).join("/")}`;
}

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 3) + "...";
}
