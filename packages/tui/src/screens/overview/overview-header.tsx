import { getTheme } from "../../theme.ts";

export function OverviewHeader() {
  const theme = getTheme();
  return (
    <box
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      justifyContent="space-between"
      flexDirection="row"
    >
      <box>
        <text fg={theme.colors.accent}>
          <b>⚡ WORKHORSE</b>
        </text>
      </box>
      <box>
        <text fg={theme.colors.dim}>AI-powered issue management</text>
      </box>
    </box>
  );
}
