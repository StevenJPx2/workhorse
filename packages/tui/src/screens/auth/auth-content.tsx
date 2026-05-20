import { For, Show } from "solid-js";
import type { ApiTokenAuthField } from "workhorse-core";

import type { PluginAuthRequirement } from "../../setup/auth.ts";
import { getTheme } from "../../theme.ts";
import { ApiTokenForm } from "./api-token-form.tsx";
import { AuthPluginCard } from "./auth-plugin-card.tsx";
import type { AuthFlowState } from "./types.ts";

export interface AuthContentProps {
  isApiTokenForm: boolean;
  remainingPlugins: PluginAuthRequirement[];
  selectedIndex: number;
  flowState: AuthFlowState;
  currentPluginName: string;
  apiTokenFields: ApiTokenAuthField[];
  apiTokenValues: Record<string, string>;
  fieldIndex: number;
  inputMode: boolean;
  inputBuffer: string;
  formError: string;
}

export function AuthContent(props: AuthContentProps) {
  return (
    <box flexDirection="column" paddingTop={2} paddingLeft={2} paddingRight={2} flexGrow={1}>
      <Show
        when={props.isApiTokenForm}
        fallback={
          <>
            <For each={props.remainingPlugins}>
              {(plugin, index) => (
                <AuthPluginCard
                  plugin={plugin}
                  isSelected={index() === props.selectedIndex}
                  flowState={props.flowState}
                />
              )}
            </For>
            {props.remainingPlugins.length === 0 && (
              <box paddingTop={2}>
                <text fg={getTheme().colors.success}>
                  <b>✓ All plugins authenticated!</b>
                </text>
              </box>
            )}
          </>
        }
      >
        <ApiTokenForm
          pluginName={props.currentPluginName}
          fields={props.apiTokenFields}
          values={props.apiTokenValues}
          currentFieldIndex={props.fieldIndex}
          inputMode={props.inputMode}
          inputBuffer={props.inputBuffer}
          error={props.formError}
        />
      </Show>
    </box>
  );
}
