import { Button } from "../../components/button/button.tsx";
import { ButtonGroup } from "../../components/button/button-group.tsx";
import { ActionBar } from "../../components/button/action-bar.tsx";
import { Card } from "../../components/card/card.tsx";
import type { FrameSpec } from "./types.ts";

export const buttonSpecs: FrameSpec[] = [
  {
    name: "button-variants",
    options: { width: 30, height: 14 },
    component: () => (
      <box flexDirection="column" gap={1}>
        <Button label="Default" />
        <Button label="Primary" variant="primary" />
        <Button label="Success" variant="success" />
        <Button label="Warning" variant="warning" />
        <Button label="Danger" variant="danger" />
        <Button label="Disabled" disabled />
        <box height={1} />
        <Button label="Ghost" style="ghost" variant="primary" />
        <Button label="Shortcut" shortcut="Ctrl+S" variant="primary" />
        <Button label="Icon" icon="+" variant="success" />
      </box>
    ),
  },
  {
    name: "button-sizes",
    options: { width: 50, height: 3 },
    component: () => (
      <box flexDirection="row" gap={2}>
        <Button label="Sm" size="sm" variant="primary" />
        <Button label="Md" size="md" variant="primary" />
        <Button label="Lg" size="lg" variant="primary" />
      </box>
    ),
  },
  {
    name: "button-group",
    options: { width: 50, height: 3 },
    component: () => (
      <ButtonGroup
        buttons={[
          { label: "Save", shortcut: "s", variant: "primary" },
          { label: "Cancel", shortcut: "c" },
          { label: "Delete", shortcut: "d", variant: "danger" },
        ]}
        style="ghost"
        size="sm"
      />
    ),
  },
  {
    name: "action-bar",
    options: { width: 60, height: 3 },
    component: () => (
      <ActionBar
        actions={[
          { key: "e", action: "escalate" },
          { key: "a", action: "switch agent" },
          { key: "j", action: "open jira", variant: "primary" },
        ]}
      />
    ),
  },
  {
    name: "card",
    options: { width: 55, height: 12 },
    component: () => (
      <box flexDirection="row" gap={1}>
        <Card title="Single" borderStyle="single" width={16}>
          <text>Content</text>
        </Card>
        <Card title="Double" borderStyle="double" width={16}>
          <text>Content</text>
        </Card>
        <Card title="Rounded" borderStyle="rounded" width={16}>
          <text>Content</text>
        </Card>
      </box>
    ),
  },
];