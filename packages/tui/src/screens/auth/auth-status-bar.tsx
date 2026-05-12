/**
 * Auth screen status bar component.
 */

import { getTheme } from "../../theme.ts";

interface AuthStatusBarProps {
  showSkip: boolean;
  isAuthenticating: boolean;
}

export function AuthStatusBar(props: AuthStatusBarProps) {
  const theme = getTheme();

  return (
    <box
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <box>
        <text fg={theme.colors.dim}>
          {props.isAuthenticating
            ? "Authenticating... Press Esc to cancel"
            : "↑/↓ Navigate • Enter Authenticate • q Quit"}
          {props.showSkip && !props.isAuthenticating && " • s Skip"}
        </text>
      </box>
    </box>
  );
}
