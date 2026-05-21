import { For, Show } from "solid-js";
import type { Issue } from "workhorse-core";

import { createIssues } from "../primitives/create-issues.ts";
import { ui } from "../state/ui";
import { getTheme } from "../theme.ts";

interface IssueListProps {
  onSelect: (issue: Issue) => void;
  onDelete?: (issue: Issue) => void;
  selectedIndex?: number;
}

/**
 * Displays all issues with status indicators.
 * Uses background colors for visual hierarchy.
 * Click to focus, Tab to navigate between components.
 */
export function IssueList(props: IssueListProps) {
  const issues = createIssues({ repository: "auto" });
  const theme = getTheme();

  // Check if this component is focused
  const isFocused = () => ui.focusedComponent() === "issues";

  return (
    <box
      flexDirection="column"
      width="50%"
      backgroundColor={theme.colors.background}
      onMouseDown={() => {
        ui.setFocusedComponent("issues");
      }}
    >
      {/* Header - highlighted when focused */}
      <box
        backgroundColor={
          isFocused() ? theme.colors.selection : theme.colors.surface
        }
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="row"
        gap={1}
      >
        <text fg={theme.colors.accent}>
          <b>ISSUES</b>
        </text>
        <text fg={theme.colors.dim}>({issues().length})</text>
      </box>

      {/* Issue list - disable focus when modal is open to prevent scroll bleeding */}
      <scrollbox
        flexGrow={1}
        stickyScroll
        stickyStart="top"
        focused={!ui.modal()}
      >
        <box flexDirection="column" paddingTop={1}>
          <For each={issues()}>
            {(issue, index) => {
              const isSelected = () =>
                isFocused() && index() === (props.selectedIndex ?? 0);
              return (
                <box
                  flexDirection="column"
                  backgroundColor={
                    isSelected() ? theme.colors.selection : undefined
                  }
                  paddingLeft={2}
                  paddingRight={2}
                  paddingTop={1}
                  paddingBottom={1}
                >
                  {/* First row: ID + status */}
                  <box flexDirection="row" justifyContent="space-between">
                    <box flexDirection="row" gap={1}>
                      <text
                        fg={
                          isSelected() ? theme.colors.accent : theme.colors.text
                        }
                      >
                        {isSelected() ? "▸ " : "  "}
                        <b>{issue.externalId || issue.id.slice(0, 8)}</b>
                      </text>
                      <text fg={getStatusColor(issue.status, theme)}>
                        [{issue.status}]
                      </text>
                    </box>
                    <Show when={isSelected()}>
                      <box
                        backgroundColor={theme.colors.error}
                        paddingLeft={1}
                        paddingRight={1}
                        onMouseDown={() => {
                          if (props.onDelete) {
                            props.onDelete(issue);
                          } else {
                            ui.openDeleteModal(issue);
                          }
                        }}
                      >
                        <text fg={theme.colors.background}>
                          <b>x</b>
                        </text>
                      </box>
                    </Show>
                  </box>
                  {/* Second row: full title */}
                  <box paddingLeft={2}>
                    <text fg={theme.colors.dim}>{issue.title}</text>
                  </box>
                </box>
              );
            }}
          </For>
          <Show when={issues().length === 0}>
            <box paddingLeft={2}>
              <text fg={theme.colors.dim}>No issues available</text>
            </box>
          </Show>
        </box>
      </scrollbox>
    </box>
  );
}

function getStatusColor(status: string, theme: ReturnType<typeof getTheme>) {
  switch (status) {
    case "pending":
      return theme.colors.dim;
    case "implementing":
    case "planning":
      return theme.colors.info;
    case "in_review":
      return theme.colors.warning;
    case "done":
      return theme.colors.success;
    case "blocked":
      return theme.colors.error;
    default:
      return theme.colors.dim;
  }
}
