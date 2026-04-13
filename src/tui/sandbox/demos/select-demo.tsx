/**
 * Select component demo
 *
 * Radio group selection with keyboard navigation.
 */

import { createSignal } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import { Select } from "../../components/select/select.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";

export function SelectDemo() {
  const { theme } = useTheme();
  const [agent, setAgent] = createSignal("opencode");
  const [priority, setPriority] = createSignal("medium");
  const [size, setSize] = createSignal("md");

  return (
    <box flexDirection="column" gap={2}>
      <text fg={theme().text.secondary}>
        Arrow keys to navigate, Enter to edit, up/down to change selection:
      </text>

      <Grid rows={3} cols={1}>
        <box flexDirection="column" gap={2}>
          {/* Vertical select */}
          <GridCell id="agent-select" row={0} col={0}>
            <Select
              value={agent()}
              onChange={setAgent}
              options={[
                { value: "opencode", label: "OpenCode", description: "AI-powered code agent" },
                { value: "claude", label: "Claude Code", description: "Anthropic's coding agent" },
                { value: "cursor", label: "Cursor", description: "AI code editor" },
              ]}
              label="Agent"
            />
          </GridCell>

          {/* Inline select */}
          <GridCell id="priority-select" row={1} col={0}>
            <Select
              value={priority()}
              onChange={setPriority}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "critical", label: "Critical" },
              ]}
              label="Priority"
              inline
            />
          </GridCell>

          {/* With disabled option */}
          <GridCell id="size-select" row={2} col={0}>
            <Select
              value={size()}
              onChange={setSize}
              options={[
                { value: "sm", label: "Small" },
                { value: "md", label: "Medium" },
                { value: "lg", label: "Large" },
                { value: "xl", label: "X-Large", disabled: true },
              ]}
              label="Size (XL disabled)"
            />
          </GridCell>
        </box>
      </Grid>

      <box marginTop={1}>
        <text fg={theme().text.dim}>
          Selected: agent={agent()} priority={priority()} size={size()}
        </text>
      </box>
    </box>
  );
}
