/**
 * TextInput component demo
 *
 * Interactive text input with keyboard handling.
 * Click or use Grid navigation to focus, then type.
 */

import { createSignal } from "solid-js";
import { useTheme } from "../../lib/theme/index.ts";
import { TextInput } from "../../components/text-input/text-input.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";

export function TextInputDemo() {
  const { theme } = useTheme();
  const [value1, setValue1] = createSignal("");
  const [value2, setValue2] = createSignal("");
  const [value3, setValue3] = createSignal("pre-filled value");
  const [submitted, setSubmitted] = createSignal<string | null>(null);

  return (
    <box flexDirection="column" gap={2}>
      <text fg={theme().text.secondary}>
        Use arrow keys to navigate, Enter to edit, Escape to exit edit mode:
      </text>

      <Grid rows={3} cols={1}>
        <box flexDirection="column" gap={2}>
          <GridCell id="input-1" row={0} col={0}>
            <TextInput
              inputId="demo-input-1"
              value={value1()}
              onChange={setValue1}
              onSubmit={(v) => setSubmitted(v)}
              placeholder="Type something here..."
              label="Basic Input"
              width={50}
            />
          </GridCell>

          <GridCell id="input-2" row={1} col={0}>
            <TextInput
              inputId="demo-input-2"
              value={value2()}
              onChange={setValue2}
              placeholder="Enter ticket key (e.g., AM-123)"
              label="Ticket Key"
              width={50}
            />
          </GridCell>

          <GridCell id="input-3" row={2} col={0}>
            <TextInput
              inputId="demo-input-3"
              value={value3()}
              onChange={setValue3}
              label="Pre-filled"
              width={50}
            />
          </GridCell>
        </box>
      </Grid>

      <box flexDirection="column" marginTop={1}>
        <text fg={theme().text.dim}>
          Values: [{value1()}] [{value2()}] [{value3()}]
        </text>
        {submitted() !== null && <text fg={theme().success}>Submitted: {submitted()}</text>}
      </box>
    </box>
  );
}
