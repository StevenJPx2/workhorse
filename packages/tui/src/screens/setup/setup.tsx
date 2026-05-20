/**
 * Setup screen for configuring required plugin settings.
 * Shown on first run or when required config is missing.
 */

import { createSignal, For, Show } from "solid-js";

import { getTheme } from "../../theme.ts";
import { SetupField } from "./setup-field.tsx";
import { SetupHeader } from "./setup-header.tsx";
import { SetupPluginTabs } from "./setup-plugin-tabs.tsx";
import { SetupStatusBar } from "./setup-status-bar.tsx";
import type { SetupPluginConfig, SetupScreenProps } from "./types.ts";
import { useSetupKeyboard } from "./use-setup-keyboard.ts";

export function Setup(props: SetupScreenProps) {
  const theme = getTheme();
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
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      <SetupHeader />
      <SetupPluginTabs plugins={props.plugins} currentPluginIndex={currentPluginIndex} />

      {/* Current plugin fields */}
      <box flexDirection="column" paddingTop={2} paddingLeft={2} paddingRight={2} flexGrow={1}>
        <Show when={currentPlugin()}>
          {(plugin: () => SetupPluginConfig) => (
            <For each={plugin().fields}>
              {(field, index) => (
                <SetupField
                  field={field}
                  isSelected={index() === currentFieldIndex()}
                  inputMode={inputMode()}
                  inputBuffer={inputBuffer()}
                  fieldValue={
                    values()[plugin().name]?.[field.key] ?? field.value ?? field.default ?? ""
                  }
                />
              )}
            </For>
          )}
        </Show>

        {/* Error message */}
        <Show when={error()}>
          <box backgroundColor={theme.colors.error} paddingLeft={2} paddingRight={2} marginTop={2}>
            <text fg={theme.colors.background}>
              <b>⚠ {error()}</b>
            </text>
          </box>
        </Show>
      </box>

      <SetupStatusBar inputMode={inputMode()} showSkip={!!props.onSkip} />
    </box>
  );
}
