import pkg from "../../../package.json";
import { getTheme } from "../../theme.ts";

export function OverviewHeader() {
  const theme = getTheme();
  return (
    <box
      backgroundColor={theme.colors.surface}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={2}
      justifyContent="space-between"
      flexDirection="row"
    >
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.accent}>
          <b>⚡ WORKHORSE</b>
        </text>
        <text fg={theme.colors.dim}>v{pkg.version}</text>
      </box>
      <box>
        <text fg={theme.colors.dim}>AI-powered issue management</text>
      </box>
    </box>
  );
}
