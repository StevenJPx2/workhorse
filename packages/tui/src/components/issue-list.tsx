import type { Issue } from "@jiratown/core";
import { createIssues } from "../primitives/create-issues.ts";
import { theme } from "../theme.ts";

interface IssueListProps {
  onSelect: (issue: Issue) => void;
}

/**
 * Displays unassigned issues from the backlog that can be picked up.
 */
export function IssueList(props: IssueListProps) {
  const issues = createIssues();

  const options = () =>
    issues().map((issue) => ({
      name: `${issue.externalId || issue.id.slice(0, 8)} ${issue.title.slice(0, 25)}`,
      value: issue,
    }));

  const handleSelect = (_index: number, option: { value: Issue }) => {
    props.onSelect(option.value);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <text>
        <b>ISSUES</b>
      </text>
      <select
        options={options()}
        onItemSelected={handleSelect}
        selectedBackgroundColor={theme.colors.selection}
      />
    </box>
  );
}
