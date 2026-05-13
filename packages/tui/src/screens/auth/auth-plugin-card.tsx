/**
 * Auth plugin card component.
 * Shows plugin auth status and provides actions.
 */

import { Show } from "solid-js";
import { getTheme } from "../../theme.ts";
import type { PluginAuthRequirement } from "../../setup/auth.ts";
import type { AuthFlowState } from "./types.ts";

interface AuthPluginCardProps {
  plugin: PluginAuthRequirement;
  isSelected: boolean;
  flowState: AuthFlowState;
}

export function AuthPluginCard(props: AuthPluginCardProps) {
  const theme = getTheme();

  const isCurrentPlugin = () =>
    props.flowState.phase !== "idle" &&
    "pluginName" in props.flowState &&
    props.flowState.pluginName === props.plugin.name;

  const getStatusIcon = () => {
    if (isCurrentPlugin()) {
      if (props.flowState.phase === "success") return "✓";
      if (props.flowState.phase === "error") return "✗";
      if (props.flowState.phase === "waiting-browser") return "⏳";
      if (props.flowState.phase === "waiting-cli") return "⏳";
      if (props.flowState.phase === "apitoken-form") return "📝";
      if (props.flowState.phase === "authenticating") return "…";
    }
    if (props.plugin.auth.type === "oauth") return "🌐";
    if (props.plugin.auth.type === "apitoken") return "🔑";
    return "⌨";
  };

  const getStatusColor = () => {
    if (isCurrentPlugin()) {
      if (props.flowState.phase === "success") return theme.colors.success;
      if (props.flowState.phase === "error") return theme.colors.error;
    }
    return props.isSelected ? theme.colors.accent : theme.colors.dim;
  };

  const getAuthTypeLabel = () => {
    if (props.plugin.auth.type === "oauth") return "OAuth 2.0";
    if (props.plugin.auth.type === "apitoken") return "API Token";
    if (props.plugin.auth.type === "external") return "External CLI";
    return "Unknown";
  };

  const getInstructions = () => {
    if (props.plugin.auth.type === "oauth") {
      return "Press Enter to open browser and sign in";
    }
    if (props.plugin.auth.type === "apitoken") {
      return "Press Enter to configure API token credentials";
    }
    if (props.plugin.auth.type === "external") {
      return props.plugin.auth.config.instructions;
    }
    return "";
  };

  return (
    <box
      flexDirection="column"
      backgroundColor={props.isSelected ? theme.colors.selection : undefined}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      marginBottom={1}
    >
      {/* Plugin name row */}
      <box flexDirection="row">
        <text fg={getStatusColor()}>{getStatusIcon()} </text>
        <text fg={props.isSelected ? theme.colors.text : theme.colors.dim}>
          <b>{props.plugin.name}</b>
        </text>
        <Show when={props.plugin.description}>
          <text fg={theme.colors.dim}> — {props.plugin.description}</text>
        </Show>
      </box>

      {/* Auth type indicator */}
      <box paddingLeft={3} paddingTop={1}>
        <text fg={theme.colors.dim}>
          {getAuthTypeLabel()} {props.plugin.status.error && `(${props.plugin.status.error})`}
        </text>
      </box>

      {/* Instructions when selected */}
      <Show when={props.isSelected && !isCurrentPlugin()}>
        <box paddingLeft={3} paddingTop={1}>
          <text fg={theme.colors.info}>{getInstructions()}</text>
        </box>
      </Show>

      {/* Current flow status */}
      <Show when={isCurrentPlugin()}>
        <box paddingLeft={3} paddingTop={1} flexDirection="column">
          <Show when={props.flowState.phase === "waiting-browser"}>
            <text fg={theme.colors.warning}>Waiting for browser authentication...</text>
          </Show>
          <Show when={props.flowState.phase === "waiting-cli"}>
            <text fg={theme.colors.warning}>
              Waiting for CLI authentication... (polling every 2s)
            </text>
            <box paddingTop={1}>
              <text fg={theme.colors.dim}>
                Run in another terminal:{" "}
                {(props.plugin.auth as { config: { authCommand: string } }).config.authCommand}
              </text>
            </box>
          </Show>
          <Show when={props.flowState.phase === "authenticating"}>
            <text fg={theme.colors.info}>Authenticating...</text>
          </Show>
          <Show when={props.flowState.phase === "success"}>
            <text fg={theme.colors.success}>Authentication successful!</text>
          </Show>
          <Show when={props.flowState.phase === "error" && "error" in props.flowState}>
            <text fg={theme.colors.error}>
              Error: {(props.flowState as { error: string }).error}
            </text>
          </Show>
        </box>
      </Show>
    </box>
  );
}
