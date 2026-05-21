/**
 * API Token form component for auth screen.
 * Displays fields from an ApiTokenProvider for user input.
 */
import { For, Show } from "solid-js";
import type { ApiTokenAuthField } from "workhorse-core";

import { getTheme } from "../../theme.ts";

interface ApiTokenFormProps {
  pluginName: string;
  fields: ApiTokenAuthField[];
  values: Record<string, string>;
  currentFieldIndex: number;
  inputMode: boolean;
  inputBuffer: string;
  error?: string;
}

export function ApiTokenForm(props: ApiTokenFormProps) {
  const theme = getTheme();

  const displayValue = (field: ApiTokenAuthField, index: number) => {
    // If this is the selected field in input mode, show the buffer
    if (index === props.currentFieldIndex && props.inputMode) {
      return null; // Handled separately with cursor
    }

    const value = props.values[field.key];
    if (!value) {
      return props.fields[index]?.placeholder || "(not set)";
    }

    // Mask secret fields
    if (field.secret) {
      return "•".repeat(Math.min(value.length, 20));
    }

    return value;
  };

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2}>
      {/* Form header */}
      <box marginBottom={2}>
        <text fg={theme.colors.accent}>
          <b>Configure {props.pluginName}</b>
        </text>
      </box>

      {/* Form fields */}
      <For each={props.fields}>
        {(field, index) => {
          const isSelected = () => index() === props.currentFieldIndex;
          const isInputMode = () => isSelected() && props.inputMode;

          return (
            <box flexDirection="column" marginBottom={1}>
              {/* Field label with required indicator */}
              <box flexDirection="row">
                <text
                  fg={isSelected() ? theme.colors.accent : theme.colors.text}
                >
                  {isSelected() ? "▸ " : "  "}
                  <b>{field.label}</b>
                  {field.required ? " " : ""}
                </text>
                <Show when={field.required}>
                  <text fg={theme.colors.error}>*</text>
                </Show>
              </box>

              {/* Field description */}
              <box paddingLeft={4}>
                <text fg={theme.colors.dim}>{field.description}</text>
              </box>

              {/* Field value */}
              <box paddingLeft={4} marginTop={1}>
                <Show
                  when={isInputMode()}
                  fallback={
                    <box
                      backgroundColor={
                        isSelected()
                          ? theme.colors.selection
                          : theme.colors.surface
                      }
                      paddingLeft={1}
                      paddingRight={1}
                    >
                      <text
                        fg={
                          props.values[field.key]
                            ? theme.colors.info
                            : theme.colors.dim
                        }
                      >
                        {displayValue(field, index())}
                      </text>
                    </box>
                  }
                >
                  <box
                    flexDirection="row"
                    backgroundColor={theme.colors.selection}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg={theme.colors.info}>
                      {field.secret
                        ? "•".repeat(props.inputBuffer.length)
                        : props.inputBuffer}
                    </text>
                    <text fg={theme.colors.accent}>▋</text>
                  </box>
                </Show>
              </box>
            </box>
          );
        }}
      </For>

      {/* Error message */}
      <Show when={props.error}>
        <box
          backgroundColor={theme.colors.error}
          paddingLeft={2}
          paddingRight={2}
          marginTop={2}
        >
          <text fg={theme.colors.background}>
            <b>⚠ {props.error}</b>
          </text>
        </box>
      </Show>

      {/* Help text */}
      <box marginTop={2} paddingLeft={2}>
        <text fg={theme.colors.dim}>
          {props.inputMode
            ? "Type value • Enter to confirm • Esc to cancel"
            : "↑/↓ Navigate • Enter to edit • Tab to submit • Esc to cancel"}
        </text>
      </box>
    </box>
  );
}
