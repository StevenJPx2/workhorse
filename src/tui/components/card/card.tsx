/**
 * Card component - Content container with optional border and title
 *
 * Provides a styled container for grouping content with
 * optional title, border, and themed background.
 *
 * @example
 * <Card title="Ticket Details">
 *   <text>AM-123: Fix authentication bug</text>
 * </Card>
 */

import { Show, type JSX } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import { spacing } from "../../theme/presets.ts";

export interface CardProps {
  /** Card title */
  title?: string;
  /** Card content */
  children: JSX.Element;
  /** Whether to show border */
  border?: boolean;
  /** Border style */
  borderStyle?: "single" | "double" | "rounded";
  /** Padding inside card */
  padding?: number;
  /** Card width */
  width?: number | `${number}%` | "auto";
  /** Card height */
  height?: number | `${number}%` | "auto";
  /** Background color override */
  backgroundColor?: string;
}

/**
 * Styled content container
 */
export function Card(props: CardProps) {
  const { theme } = useTheme();

  const showBorder = () => props.border ?? true;
  const borderStyle = () => props.borderStyle ?? "rounded";
  const cardPadding = () => props.padding ?? spacing.sm;

  return (
    <box
      flexDirection="column"
      border={showBorder()}
      borderStyle={borderStyle()}
      borderColor={theme().border.default}
      backgroundColor={props.backgroundColor ?? theme().bg.elevated}
      padding={cardPadding()}
      width={props.width}
      height={props.height}
    >
      {/* Title */}
      <Show when={props.title}>
        <text fg={theme().text.primary} marginBottom={1}>
          {props.title}
        </text>
      </Show>

      {/* Content */}
      {props.children}
    </box>
  );
}
