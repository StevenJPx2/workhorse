/**
 * Component to display the Workhorse workflow status (planning, implementing, etc.)
 */
import type { IssueStatus } from "workhorse-core";

import { getTheme } from "../theme.ts";
import {
  formatWorkflowStatus,
  getWorkflowStatusColor,
  getWorkflowStatusIcon,
} from "./agent-sidebar/status-utils.ts";

interface WorkhorseStatusProps {
  status: IssueStatus | null;
  compact?: boolean;
}

/**
 * Displays the Workhorse workflow status with icon and color.
 */
export function WorkhorseStatus(props: WorkhorseStatusProps) {
  const status = () => props.status ?? "pending";

  return (
    <text fg={getWorkflowStatusColor(status(), getTheme())}>
      {props.compact ? "" : getWorkflowStatusIcon(status()) + " "}
      {formatWorkflowStatus(status())}
    </text>
  );
}
