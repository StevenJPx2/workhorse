/**
 * TicketInput component - Modal dialog for adding a new ticket
 *
 * Provides a form to enter a Jira ticket key or URL and select an agent.
 * Uses grid-based spatial navigation for keyboard accessibility.
 *
 * @example
 * <TicketInput
 *   isOpen={showDialog()}
 *   onClose={() => setShowDialog(false)}
 *   onSubmit={(key, agent, issue) => tickets.create(...)}
 *   fetchIssue={atlassian.fetchIssue}
 * />
 */

import { createEffect } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import type { AgentType } from "#types/config.ts";
import { Button } from "../button/index.ts";
import { Dialog } from "../dialog/index.ts";
import { Grid, GridCell } from "../grid/index.ts";
import { Select } from "../select/index.ts";
import { TextInput } from "../text-input/index.ts";
import type { TicketInputProps } from "./types.ts";
import { useTicketInput } from "./use-ticket-input.ts";

const AGENT_OPTIONS = [
  { value: "opencode" as AgentType, label: "OpenCode" },
  { value: "claude" as AgentType, label: "Claude Code" },
];

const INPUT_ID = "ticket-input-field";

/**
 * Modal dialog for adding a new Jira ticket with spatial navigation
 */
export function TicketInput(props: TicketInputProps) {
  const { theme } = useTheme();

  const form = useTicketInput({
    fetchIssue: props.fetchIssue,
    onSubmit: (key, agent, issue) => {
      props.onSubmit(key, agent, issue);
      props.onClose();
      form.reset();
    },
    defaultAgent: props.defaultAgent,
  });

  // Reset form when dialog opens
  createEffect(() => {
    if (props.isOpen) {
      form.reset();
    }
  });

  const handleClose = () => {
    form.reset();
    props.onClose();
  };

  const handleSubmit = async () => {
    await form.submit();
  };

  return (
    <Dialog
      isOpen={props.isOpen}
      onClose={handleClose}
      lockId="ticket-input-dialog"
      title="Add Ticket"
      width={50}
      height={form.error() ? 22 : 18}
    >
      <Grid rows={4} cols={2} wrap>
        <box flexDirection="column" width="100%">
          {/* Row 0: Ticket key input - spans both columns */}
          <GridCell id="input" row={0} col={0} colSpan={2}>
            <TextInput
              inputId={INPUT_ID}
              value={form.input()}
              onChange={form.setInput}
              onSubmit={() => {
                if (form.isValid()) handleSubmit();
              }}
              placeholder="AM-123 or paste Jira URL"
              label="Ticket"
            />
          </GridCell>

          {/* Row 1: Parsed key feedback or error - spans both columns */}
          <GridCell id="feedback" row={1} col={0} colSpan={2}>
            <box
              height={form.error() ? 8 : 1}
              width="100%"
              flexDirection="column"
              overflow="hidden"
            >
              <text fg={form.error() ? theme().error : theme().text.dim}>
                {form.error() || (form.ticketKey() ? `Key: ${form.ticketKey()}` : " ")}
              </text>
            </box>
          </GridCell>

          {/* Row 2: Agent selection - spans both columns */}
          <GridCell id="select" row={2} col={0} colSpan={2}>
            <Select
              value={form.agent()}
              onChange={form.setAgent}
              options={AGENT_OPTIONS}
              label="Agent"
              inline
            />
          </GridCell>

          {/* Row 3: Buttons side by side */}
          <box flexDirection="row" justifyContent="flex-end" marginTop={1}>
            <GridCell id="cancel" row={3} col={0}>
              <Button label="Cancel" onPress={handleClose} style="ghost" />
            </GridCell>
            <box width={2} />
            <GridCell id="submit" row={3} col={1}>
              <Button
                label={form.isLoading() ? "Loading..." : "Add Ticket"}
                onPress={handleSubmit}
                disabled={!form.isValid() || form.isLoading()}
                variant="primary"
              />
            </GridCell>
          </box>
        </box>
      </Grid>
    </Dialog>
  );
}
