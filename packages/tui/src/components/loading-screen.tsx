import { getTheme } from "../theme.ts";
import { Spinner } from "./spinner.tsx";

export interface LoadingScreenProps {
  stage: () => string;
}

/**
 * Full-screen loading component displayed during TUI startup.
 * Shows an animated spinner and the current bootstrap stage.
 * Uses active theme colors.
 */
export function LoadingScreen(props: LoadingScreenProps) {
  const theme = getTheme();

  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
      justifyContent="center"
      alignItems="center"
    >
      <box
        width={50}
        height={7}
        borderStyle="single"
        borderColor={theme.colors.border}
        backgroundColor={theme.colors.surface}
        justifyContent="center"
        alignItems="center"
        flexDirection="column"
      >
        <box flexDirection="row" gap={1}>
          <Spinner color={theme.colors.accent} />
          <text fg={theme.colors.accent}>
            <b>Starting Workhorse...</b>
          </text>
        </box>
        <text fg={theme.colors.dim} marginTop={1}>
          {props.stage()}
        </text>
      </box>
    </box>
  );
}
