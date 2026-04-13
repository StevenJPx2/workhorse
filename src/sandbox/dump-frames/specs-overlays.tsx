import { For } from "solid-js";
import { Dialog } from "../../components/dialog/dialog.tsx";
import { Button } from "../../components/button/button.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";
import { StatusBadge } from "../../components/status-badge/status-badge.tsx";
import { Divider } from "../../components/divider/divider.tsx";
import type { TicketStatus } from "../../types/ticket.ts";
import type { FrameSpec } from "./types.ts";

export const overlaySpecs: FrameSpec[] = [
  {
    name: "dialog-open",
    options: { width: 60, height: 20 },
    component: () => (
      <Dialog
        isOpen={true}
        onClose={() => {}}
        lockId="dump-dialog"
        title="Confirm Action"
        hint="Press Escape to close"
        width={45}
        height={10}
      >
        <text>Are you sure you want to proceed?</text>
      </Dialog>
    ),
  },
  {
    name: "dialog-with-footer",
    options: { width: 60, height: 20 },
    component: () => (
      <Dialog
        isOpen={true}
        onClose={() => {}}
        lockId="dump-dialog-f"
        title="Delete Ticket"
        width={45}
        height={12}
        footer={
          <box flexDirection="row" gap={2} justifyContent="flex-end">
            <Button label="Cancel" style="ghost" size="sm" />
            <Button label="Delete" variant="danger" size="sm" />
          </box>
        }
      >
        <text>This cannot be undone.</text>
      </Dialog>
    ),
  },
  {
    name: "grid",
    options: { width: 40, height: 6 },
    component: () => (
      <Grid rows={2} cols={3} wrap>
        <box flexDirection="column" gap={1}>
          <box flexDirection="row" gap={1}>
            <GridCell id="a" row={0} col={0}>
              <Button label="A" variant="primary" />
            </GridCell>
            <GridCell id="b" row={0} col={1}>
              <Button label="B" variant="success" />
            </GridCell>
            <GridCell id="c" row={0} col={2}>
              <Button label="C" variant="warning" />
            </GridCell>
          </box>
          <box flexDirection="row" gap={1}>
            <GridCell id="d" row={1} col={0}>
              <Button label="D" style="ghost" />
            </GridCell>
            <GridCell id="e" row={1} col={1}>
              <Button label="E" style="ghost" />
            </GridCell>
            <GridCell id="f" row={1} col={2}>
              <Button label="F" style="ghost" />
            </GridCell>
          </box>
        </box>
      </Grid>
    ),
  },
  {
    name: "status-badges",
    options: { width: 60, height: 20 },
    component: () => {
      const statuses: TicketStatus[] = [
        "pending",
        "queued",
        "planning",
        "implementing",
        "blocked",
        "pr_created",
        "in_review",
        "done",
      ];
      return (
        <box flexDirection="column">
          <For each={statuses}>
            {(s) => (
              <box flexDirection="row" gap={2}>
                <StatusBadge status={s} />
                <StatusBadge status={s} showLabel={false} />
                <StatusBadge status={s} compact />
              </box>
            )}
          </For>
        </box>
      );
    },
  },
  {
    name: "dividers",
    options: { width: 50, height: 12 },
    component: () => (
      <box flexDirection="column">
        <Divider />
        <Divider label="OR" />
        <Divider char="═" />
        <Divider length={20} />
      </box>
    ),
  },
];
