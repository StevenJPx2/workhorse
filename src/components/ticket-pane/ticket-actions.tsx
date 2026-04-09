/**
 * TicketActions component - Action bar for ticket operations
 */

import { ActionBar } from "../button/index.ts";
import type { TicketActionsProps } from "./types.ts";

/**
 * Action bar with ticket operations
 */
export function TicketActions(_props: TicketActionsProps) {
  const actions = [
    { key: "e", action: "escalate" },
    { key: "a", action: "switch agent" },
    { key: "o", action: "open jira" },
    { key: "x", action: "close" },
  ];

  return <ActionBar actions={actions} />;
}
