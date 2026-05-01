/**
 * Setup screen for configuring required plugin settings.
 * Shown on first run or when required config is missing.
 */

import { createSignal, For, Show } from "solid-js";
import { theme } from "../../theme.ts";
import type { SetupPluginConfig, SetupScreenProps } from "./types.ts";
import { useSetupKeyboard } from "./use-setup-keyboard.ts";

export function Setup(props: SetupScreenProps) {
  const [currentPluginIndex, setCurrentPluginIndex] = createSignal(0);
  const [currentFieldIndex, setCurrentFieldIndex] = createSignal(0);
  const [values, setValues] = createSignal<Record<string, Record<string, string>>>({});
  const [inputMode, setInputMode] = createSignal(false);
  const [inputBuffer, setInputBuffer] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  // Initialize values from existing config
  const initial: Record<string, Record<string, string>> = {};
  for (const plugin of props.plugins) {
    initial[plugin.name] = {};
    for (const field of plugin.fields) {
      if (field.value) {
        initial[plugin.name]![field.key] = field.value;
      } else if (field.default) {
        initial[plugin.name]![field.key] = field.default;
      }
    }
  }
  setValues(initial);

  const { currentPlugin } = useSetupKeyboard({
    inputMode,
    setInputMode,
    inputBuffer,
    setInputBuffer,
    currentPluginIndex,
    setCurrentPluginIndex,
    currentFieldIndex,
    setCurrentFieldIndex,
    plugins: props.plugins,
    values,
    setValues,
    setError,
    onComplete: props.onComplete,
    onSkip: props.onSkip,
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box borderStyle="single" padding={1}>
        <box flexDirection="row">
          <text fg={theme.colors.info}>
            <b>Jiratown Setup</b>
          </text>
          <text fg={theme.colors.dim}> — Configure plugins before starting</text>
        </box>
      </box>

      {/* Content */}
      <box flexDirection="column" padding={2} flexGrow={1}>
        {/* Plugin tabs */}
        <box flexDirection="row" marginBottom={1}>
          <For each={props.plugins}>
            {(plugin, index) => (
              <box flexDirection="row">
                <text fg={index() === currentPluginIndex() ? theme.colors.info : theme.colors.dim}>
                  <b>{plugin.name}</b>
                </text>
                <Show when={index() < props.plugins.length - 1}>
                  <text fg={theme.colors.dim}> │ </text>
                </Show>
              </box>
            )}
          </For>
        </box>

        {/* Current plugin fields */}
        <box flexDirection="column" borderStyle="single" padding={1} flexGrow={1}>
          <Show when={currentPlugin()}>
            {(plugin: () => SetupPluginConfig) => (
              <For each={plugin().fields}>
                {(field, index) => {
                  const isSelected = () => index() === currentFieldIndex();
                  const fieldValue = () =>
                    values()[plugin().name]?.[field.key] ?? field.value ?? field.default ?? "";

                  return (
                    <box flexDirection="column" marginBottom={1}>
                      <box>
                        <text fg={isSelected() ? theme.colors.info : theme.colors.text}>
                          <b>
                            {`${isSelected() ? "▸ " : "  "}${field.label}${field.required ? " *" : ""}`}
                          </b>
                        </text>
                      </box>
                      <box>
                        <text fg={theme.colors.dim}>{`    ${field.description}`}</text>
                      </box>
                      <box>
                        <Show
                          when={isSelected() && inputMode()}
                          fallback={
                            <text
                              fg={fieldValue() ? theme.colors.text : theme.colors.dim}
                              bg={isSelected() ? theme.colors.selection : undefined}
                            >
                              {`    ${fieldValue() || "(not set)"}`}
                            </text>
                          }
                        >
                          <text bg={theme.colors.selection}>{`    ${inputBuffer()}▋`}</text>
                        </Show>
                      </box>
                    </box>
                  );
                }}
              </For>
            )}
          </Show>
        </box>

        {/* Error message */}
        <Show when={error()}>
          <text fg={theme.colors.error} marginTop={1}>
            {`⚠ ${error()}`}
          </text>
        </Show>
      </box>

      {/* Status bar */}
      <box borderStyle="single" padding={1}>
        <Show
          when={inputMode()}
          fallback={
            <box flexDirection="row">
              <text fg={theme.colors.dim}>
                <b>Enter/e</b>
                {" edit │ "}
                <b>j/k</b>
                {" navigate │ "}
                <b>s</b>
                {" save & continue"}
              </text>
              <Show when={props.onSkip}>
                <text fg={theme.colors.dim}>
                  {" │ "}
                  <b>ESC</b>
                  {" skip"}
                </text>
              </Show>
            </box>
          }
        >
          <text fg={theme.colors.dim}>
            <b>Enter</b>
            {" save │ "}
            <b>ESC</b>
            {" cancel"}
          </text>
        </Show>
      </box>
    </box>
  );
}
