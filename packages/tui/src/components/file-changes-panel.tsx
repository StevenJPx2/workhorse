/**
 * File changes panel - shows list of modified files with +/- line counts.
 * Displays git diff stats for the agent's worktree.
 */

import { For, Show, type Accessor } from "solid-js";

import type { FileChangesState } from "../primitives/create-file-changes.ts";
import { ui } from "../state/ui";
import { getTheme } from "../theme.ts";

interface FileChangesPanelProps {
  state: Accessor<FileChangesState>;
  /** Panel width (default: 30) */
  width?: number;
}

/** File changes panel showing modified files with line stats. */
export function FileChangesPanel(props: FileChangesPanelProps) {
  const theme = getTheme();
  const width = props.width ?? 30;

  return (
    <box flexDirection="column" width={width}>
      {/* Header with totals */}
      <box
        backgroundColor={theme.colors.surface}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={theme.colors.info}>
          <b>📁 FILES</b>
        </text>
        <Show when={props.state().files.length > 0}>
          <box flexDirection="row" gap={1}>
            <text fg={theme.colors.success}>+{props.state().totalAdditions}</text>
            <text fg={theme.colors.error}>-{props.state().totalDeletions}</text>
          </box>
        </Show>
      </box>

      {/* File list - disable focus when modal is open or chat is focused */}
      <scrollbox
        flexGrow={1}
        stickyScroll
        focused={!ui.modal() && ui.focusedComponent() !== "chat"}
      >
        <box flexDirection="column">
          <Show
            when={props.state().files.length > 0}
            fallback={
              <box paddingLeft={1} paddingTop={1}>
                <text fg={theme.colors.dim}>
                  <i>{props.state().loading ? "Loading..." : "No changes"}</i>
                </text>
              </box>
            }
          >
            <For each={props.state().files}>
              {(file) => <FileRow file={file} maxWidth={width - 2} />}
            </For>
          </Show>
        </box>
      </scrollbox>
    </box>
  );
}

interface FileRowProps {
  file: { path: string; additions: number; deletions: number };
  maxWidth: number;
}

/** Single file row with path and +/- counts. */
function FileRow(props: FileRowProps) {
  const theme = getTheme();

  // Truncate path to fit, keeping filename visible
  const displayPath = () => {
    const { path } = props.file;
    const maxLen = props.maxWidth - 12; // Reserve space for +/- numbers

    if (path.length <= maxLen) return path;

    // Try to show filename with truncated directory
    const parts = path.split("/");
    const filename = parts.pop() ?? path;

    if (filename.length >= maxLen - 3) {
      return "..." + filename.slice(-(maxLen - 3));
    }

    const remaining = maxLen - filename.length - 4; // ".../" prefix
    const dirPath = parts.join("/");

    if (remaining > 0 && dirPath.length > remaining) {
      return ".../" + dirPath.slice(-remaining) + "/" + filename;
    }

    return ".../" + filename;
  };

  return (
    <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <box flexShrink={1} overflow="hidden">
        <text fg={theme.colors.text}>{displayPath()}</text>
      </box>
      <box flexDirection="row" flexShrink={0} gap={1}>
        <Show when={props.file.additions > 0}>
          <text fg={theme.colors.success}>+{props.file.additions}</text>
        </Show>
        <Show when={props.file.deletions > 0}>
          <text fg={theme.colors.error}>-{props.file.deletions}</text>
        </Show>
      </box>
    </box>
  );
}
