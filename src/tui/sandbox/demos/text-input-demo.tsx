/**
 * TextInput component demo
 *
 * Interactive text input with keyboard handling.
 * Click or use Grid navigation to focus, then type.
 */

import { createSignal } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import { TextInput } from "../../components/text-input/text-input.tsx";
import { ChatBox } from "../../components/chat-box/index.ts";
import { Grid, GridCell } from "../../components/grid/index.ts";

export function TextInputDemo() {
  const { theme } = useTheme();
  const [value1, setValue1] = createSignal("");
  const [value2, setValue2] = createSignal("");
  const [value3, setValue3] = createSignal("pre-filled value");
  const [multilineValue, setMultilineValue] = createSignal("");
  const [overflowValue, setOverflowValue] = createSignal("This is a very long text");
  const [submitted, setSubmitted] = createSignal<string | null>(null);
  const [chatValue, setChatValue] = createSignal("");

  return (
    <box flexDirection="column" gap={2}>
      <text fg={theme().text.secondary}>
        Use arrow keys to navigate, Enter to edit, Escape to exit edit mode:
      </text>

      <Grid rows={5} cols={1}>
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

          <GridCell id="input-overflow" row={3} col={0}>
            <TextInput
              inputId="demo-input-overflow"
              value={overflowValue()}
              onChange={setOverflowValue}
              label="Overflow (30 chars) - shows end of text"
              width={30}
            />
          </GridCell>

          <GridCell id="input-multiline" row={4} col={0}>
            <TextInput
              inputId="demo-input-multiline"
              value={multilineValue()}
              onChange={setMultilineValue}
              onSubmit={(v) => setSubmitted(v)}
              placeholder="Type multiple lines... (Enter=newline, Cmd+Enter=submit)"
              label="Multiline Input"
              width={50}
              height={4}
              multiline
            />
          </GridCell>
        </box>
      </Grid>

      <box flexDirection="column" marginTop={1}>
        <text fg={theme().text.dim}>
          Single-line: [{value1()}] [{value2()}]
        </text>
        <text fg={theme().text.dim}>Overflow: [{overflowValue()}]</text>
        <text fg={theme().text.dim}>Multiline: [{multilineValue().replace(/\n/g, "\\n")}]</text>
        {submitted() !== null && <text fg={theme().success}>Submitted: {submitted()}</text>}
      </box>

      {/* ChatBox demo - shows how it looks in context */}
      <box flexDirection="column" marginTop={2}>
        <text fg={theme().text.secondary}>ChatBox demo (press 'c' to focus):</text>
        <box width={60} marginTop={1}>
          <ChatBox
            inputId="demo-chat"
            value={chatValue()}
            setValue={setChatValue}
            submit={() => {
              setSubmitted(chatValue());
              setChatValue("");
            }}
            placeholder="Type a message to the agent..."
          />
        </box>
        <text fg={theme().text.dim} marginTop={1}>
          Chat value: [{chatValue()}]
        </text>
      </box>
    </box>
  );
}
