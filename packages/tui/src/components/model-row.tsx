import type { ModelInfo } from "@jiratown/plugin-pi-adapter";
import { getTheme } from "../theme.ts";

interface ModelRowProps {
  model: ModelInfo;
  isSelected: boolean;
  isCurrent: boolean;
}

/** Single row in the model selector list. */
export function ModelRow(props: ModelRowProps) {
  const theme = getTheme();

  const formatContext = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    return `${Math.round(tokens / 1000)}K`;
  };

  // Derive these as getters so they react to prop changes
  const providerIcon = () => (props.model.provider === "opencode" ? "⚡" : "🔷");
  const indicator = () => (props.isCurrent ? "✓" : props.isSelected ? "●" : "○");
  const textColor = () =>
    props.isCurrent
      ? theme.colors.success
      : props.isSelected
        ? theme.colors.accent
        : theme.colors.dim;

  return (
    <box
      backgroundColor={props.isSelected ? theme.colors.selection : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg={textColor()}>
        {indicator()} {providerIcon()} {props.model.name}
      </text>
      <text fg={theme.colors.dim}> ({formatContext(props.model.contextWindow)})</text>
      {props.model.isDefault && <text fg={theme.colors.info}> [default]</text>}
    </box>
  );
}
