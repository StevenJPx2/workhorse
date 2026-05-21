/**
 * Auth screen header component.
 */
import { getTheme } from "../../theme.ts";

export function AuthHeader() {
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
        <text fg={theme.colors.accent}>
          <b>🔐 AUTHENTICATION</b>
        </text>
      </box>
      <box>
        <text fg={theme.colors.dim}>Sign in to continue</text>
      </box>
    </box>
  );
}
