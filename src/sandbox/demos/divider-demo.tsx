/**
 * Divider component demo
 *
 * Horizontal and vertical separators with labels.
 */

import { useTheme } from "../../lib/theme/index.ts";
import { Divider } from "../../components/divider/divider.tsx";

export function DividerDemo() {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" gap={1}>
      {/* Basic horizontal */}
      <text fg={theme().text.secondary}>Basic horizontal:</text>
      <Divider />

      {/* With label */}
      <text fg={theme().text.secondary}>With label:</text>
      <Divider label="OR" />

      {/* Custom character */}
      <text fg={theme().text.secondary}>Custom character (═):</text>
      <Divider char="═" />

      {/* Custom length */}
      <text fg={theme().text.secondary}>Short (length=20):</text>
      <Divider length={20} />

      {/* With label and custom color */}
      <text fg={theme().text.secondary}>Colored with label:</text>
      <Divider label="SECTION" color={theme().primary} />

      {/* Vertical dividers */}
      <text fg={theme().text.secondary}>Vertical dividers in a row:</text>
      <box flexDirection="row" height={3} alignItems="center">
        <text fg={theme().text.primary}>Left</text>
        <Divider orientation="vertical" />
        <text fg={theme().text.primary}>Center</text>
        <Divider orientation="vertical" />
        <text fg={theme().text.primary}>Right</text>
      </box>
    </box>
  );
}
