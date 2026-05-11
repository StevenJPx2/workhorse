import type { Issue } from "@jiratown/core";
import { createSignal, For } from "solid-js";
import { createIssues } from "../primitives/create-issues.ts";
import { ui } from "../state/ui.ts";
import { getTheme } from "../theme.ts";

interface IssueListProps {
  onSelect: (issue: Issue) => void;
  onDelete?: (issue: Issue) => void;
  selectedIndex?: number;
}

/**
 * Displays unassigned issues from the backlog that can be picked up.
 * Uses background colors for visual hierarchy.
 * Click to focus, Tab to navigate between components.
 */
export function IssueList(props: IssueListProps) {
  const issues = createIssues();
  const theme = getTheme();

  // Check if this component is focused
  const isFocused = () => ui.focusedComponent() === "issues";

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      backgroundColor={theme.colors.background}
      onMouseDown={() => {
        ui.setFocusedComponent("issues");
      }}
    >
      {/* Header - highlighted when focused */}
      <box
        backgroundColor={isFocused() ? theme.colors.selection : theme.colors.surface}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={theme.colors.accent}>
          <b>⚡ ISSUES</b>
        </text>
        <text fg={theme.colors.dim}> ({issues().length})</text>
      </box>

      {/* Issue list */}
      <box flexDirection="column" flexGrow={1} paddingTop={1}>
        <For each={issues()}>
          {(issue, index) => {
            // Only show selection highlight if this list is focused
            const isSelected = () => isFocused() && index() === (props.selectedIndex ?? 0);
            const [isHovered, setIsHovered] = createSignal(false);
            const showDelete = () => isSelected() || isHovered();
            return (
              <box
                flexDirection="row"
                backgroundColor={isSelected() ? theme.colors.selection : undefined}
                paddingLeft={2}
                paddingRight={2}
                onMouseOver={() => setIsHovered(true)}
                onMouseOut={() => setIsHovered(false)}
                justifyContent="space-between"
              >
                <box flexDirection="row">
                  <text fg={isSelected() ? theme.colors.accent : theme.colors.text}>
                    {isSelected() ? "▸ " : "  "}
                    <b>{issue.externalId || issue.id.slice(0, 8)}</b>
                  </text>
                  <text fg={theme.colors.dim}>{` ${issue.title.slice(0, 20)}`}</text>
                </box>
                {showDelete() && (
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
                      <b>x delete</b>
                    </text>
                  </box>
                )}
              </box>
            );
          }}
        </For>
        {issues().length === 0 && (
          <box paddingLeft={2}>
            <text fg={theme.colors.dim}>No issues available</text>
          </box>
        )}
      </box>
    </box>
  );
}
