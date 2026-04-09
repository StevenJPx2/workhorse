import { TextInput } from "../../components/text-input/text-input.tsx";
import { Select } from "../../components/select/select.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";
import type { FrameSpec } from "./types.ts";

export const fieldSpecs: FrameSpec[] = [
  {
    name: "text-input-empty",
    options: { width: 45, height: 8 },
    component: () => (
      <TextInput inputId="d1" value="" onChange={() => {}} placeholder="Type here..." label="Name" width={40} />
    ),
  },
  {
    name: "text-input-filled",
    options: { width: 45, height: 8 },
    component: () => (
      <TextInput inputId="d2" value="AM-123" onChange={() => {}} label="Ticket" width={40} />
    ),
  },
  {
    name: "text-input-edit-mode",
    options: { width: 45, height: 8 },
    component: () => (
      <Grid rows={1} cols={1}>
        <GridCell id="ti" row={0} col={0}>
          <TextInput inputId="d3" value="editing" onChange={() => {}} width={40} />
        </GridCell>
      </Grid>
    ),
    interactions: async (ctx) => {
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();
    },
  },
  {
    name: "select-vertical",
    options: { width: 30, height: 10 },
    component: () => (
      <Select
        value="b"
        onChange={() => {}}
        options={[
          { value: "a", label: "OpenCode" },
          { value: "b", label: "Claude Code" },
          { value: "c", label: "Cursor" },
        ]}
        label="Agent"
      />
    ),
  },
  {
    name: "select-inline",
    options: { width: 50, height: 6 },
    component: () => (
      <Select
        value="medium"
        onChange={() => {}}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]}
        label="Priority"
        inline
      />
    ),
  },
];