/**
 * Screen shown when OAuth configuration (env vars) is missing for a plugin.
 * Gives the user clear instructions and lets them choose to continue without the plugin.
 */

import { useKeyboard, useRenderer } from "@opentui/solid";

import { getTheme } from "../theme.ts";

export interface OAuthConfigMissingProps {
  /** Name of the plugin missing OAuth config */
  pluginName: string;
  /** List of missing environment variables */
  missingVars: string[];
  /** Called when user wants to continue without the plugin */
  onContinue: () => void;
  /** Called when user wants to quit and configure */
  onQuit: () => void;
}

export function OAuthConfigMissing(props: OAuthConfigMissingProps) {
  const theme = getTheme();
  const renderer = useRenderer();

  useKeyboard((event) => {
    switch (event.name) {
      case "return":
      case "c":
        props.onContinue();
        break;
      case "q":
        props.onQuit();
        break;
      case "escape":
        renderer.destroy();
        process.exit(1);
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      {/* Header */}
      <box paddingLeft={2} paddingTop={1} paddingBottom={1} backgroundColor={theme.colors.surface}>
        <text fg={theme.colors.warning}>
          <b>⚠️ {props.pluginName} OAuth Not Configured</b>
        </text>
      </box>

      {/* Content */}
      <box flexDirection="column" paddingTop={2} paddingLeft={2} paddingRight={2} flexGrow={1}>
        <box flexDirection="column" paddingBottom={1}>
          <text fg={theme.colors.text}>
            The following environment variables are required for {props.pluginName} OAuth:
          </text>
        </box>

        <box flexDirection="column" paddingLeft={2} paddingBottom={2}>
          {props.missingVars.map((varName) => (
            <text fg={theme.colors.error}>• {varName}</text>
          ))}
        </box>

        <box flexDirection="column" paddingBottom={2}>
          <text fg={theme.colors.dim}>To enable {props.pluginName} integration:</text>
          <box paddingLeft={2} paddingTop={1} flexDirection="column">
            <text fg={theme.colors.dim}>
              1. Create an OAuth 2.0 app in your Atlassian Developer Console
            </text>
            <text fg={theme.colors.dim}>
              2. Set the environment variables in your shell or .env file
            </text>
            <text fg={theme.colors.dim}>3. Restart Workhorse</text>
          </box>
        </box>

        <box paddingTop={1} flexDirection="column">
          <text fg={theme.colors.accent}>
            See: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
          </text>
        </box>
      </box>

      {/* Footer */}
      <box
        paddingLeft={2}
        paddingTop={1}
        paddingBottom={1}
        border
        borderStyle="single"
        borderColor={theme.colors.border}
      >
        <text fg={theme.colors.dim}>
          <b>[C]</b>ontinue without {props.pluginName} • <b>[Q]</b>uit to configure
        </text>
      </box>
    </box>
  );
}
