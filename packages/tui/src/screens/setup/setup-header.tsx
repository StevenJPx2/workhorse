import { getTheme } from "../../theme.ts";

export function SetupHeader() {
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
          <b>⚡ JIRATOWN SETUP</b>
        </text>
      </box>
      <box>
        <text fg={theme.colors.dim}>Configure plugins before starting</text>
      </box>
    </box>
  );
}
