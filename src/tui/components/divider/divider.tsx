/**
 * Divider component - Visual separator line
 *
 * Provides a horizontal or vertical divider line for
 * visual separation between content sections.
 *
 * @example
 * <Divider />
 * <Divider orientation="vertical" />
 * <Divider label="OR" />
 */

import { Show } from "solid-js";
import { useTheme } from "../../theme/index.ts";

export interface DividerProps {
  /** Orientation of the divider */
  orientation?: "horizontal" | "vertical";
  /** Character to use for the line */
  char?: string;
  /** Optional label text in the middle */
  label?: string;
  /** Color override */
  color?: string;
  /** Length/width of the divider */
  length?: number;
  /** Margin around divider */
  margin?: number;
}

/**
 * Visual separator line
 */
export function Divider(props: DividerProps) {
  const { theme } = useTheme();

  const orientation = () => props.orientation ?? "horizontal";
  const char = () => props.char ?? (orientation() === "horizontal" ? "─" : "│");
  const color = () => props.color ?? theme().border.default;
  const margin = () => props.margin ?? 1;

  // Create the divider line
  const createLine = (length: number) => char().repeat(length);

  if (orientation() === "vertical") {
    return (
      <box flexDirection="column" marginLeft={margin()} marginRight={margin()} alignItems="center">
        <text fg={color()}>{char()}</text>
      </box>
    );
  }

  // Horizontal divider
  const lineLength = () => props.length ?? 40;

  return (
    <box
      flexDirection="row"
      marginTop={margin()}
      marginBottom={margin()}
      alignItems="center"
      height={1}
    >
      <Show when={props.label} fallback={<text fg={color()}>{createLine(lineLength())}</text>}>
        {/* Left line */}
        <text fg={color()}>{createLine(5)}</text>
        {/* Label */}
        <text fg={theme().text.dim}> {props.label} </text>
        {/* Right line */}
        <text fg={color()}>{createLine(lineLength() - 7 - (props.label?.length ?? 0))}</text>
      </Show>
    </box>
  );
}
