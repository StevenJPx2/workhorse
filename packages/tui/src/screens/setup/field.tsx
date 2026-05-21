import { Show } from "solid-js";

import { getTheme } from "../../theme.ts";
import type { SetupField as SetupFieldType } from "./types.ts";

interface SetupFieldProps {
  field: SetupFieldType;
  isSelected: boolean;
  inputMode: boolean;
  inputBuffer: string;
  fieldValue: string;
}

export function SetupField(props: SetupFieldProps) {
  const theme = getTheme();

  return (
    <box flexDirection="column" marginBottom={2}>
      {/* Field label */}
      <box>
        <text fg={props.isSelected ? theme.colors.accent : theme.colors.text}>
          {props.isSelected ? "▸ " : "  "}
          <b>{props.field.label}</b>
        </text>
        {props.field.required && <text fg={theme.colors.error}> *</text>}
      </box>

      {/* Field description */}
      <box paddingLeft={4}>
        <text fg={theme.colors.dim}>{props.field.description}</text>
      </box>

      {/* Field value */}
      <box paddingLeft={4} marginTop={1}>
        <Show
          when={props.isSelected && props.inputMode}
          fallback={
            <box
              backgroundColor={
                props.isSelected ? theme.colors.selection : theme.colors.surface
              }
              paddingLeft={1}
              paddingRight={1}
            >
              <text
                fg={props.fieldValue ? theme.colors.info : theme.colors.dim}
              >
                {props.fieldValue || "(not set)"}
              </text>
            </box>
          }
        >
          <box
            backgroundColor={theme.colors.selection}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={theme.colors.info}>{props.inputBuffer}</text>
            <text fg={theme.colors.accent}>▋</text>
          </box>
        </Show>
      </box>
    </box>
  );
}
