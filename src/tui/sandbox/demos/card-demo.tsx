/**
 * Card component demo
 *
 * Showcases card with various configurations.
 */

import { useTheme } from "../../theme/index.ts";
import { Card } from "../../components/card/card.tsx";

export function CardDemo() {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" gap={2}>
      {/* Basic card */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Basic card with title:</text>
        <Card title="Ticket Details" width={50}>
          <text fg={theme().text.primary}>AM-123: Fix authentication bug</text>
          <text fg={theme().text.dim}>Status: In Progress</text>
        </Card>
      </box>

      {/* Border styles */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Border styles:</text>
        <box flexDirection="row" gap={2}>
          <Card title="Single" borderStyle="single" width={20}>
            <text fg={theme().text.primary}>Content</text>
          </Card>
          <Card title="Double" borderStyle="double" width={20}>
            <text fg={theme().text.primary}>Content</text>
          </Card>
          <Card title="Rounded" borderStyle="rounded" width={20}>
            <text fg={theme().text.primary}>Content</text>
          </Card>
        </box>
      </box>

      {/* No border */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>No border:</text>
        <Card border={false} width={50}>
          <text fg={theme().text.primary}>A card without a border</text>
        </Card>
      </box>

      {/* Custom background */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Custom background:</text>
        <Card title="Highlighted" backgroundColor={theme().bg.highlight} width={50}>
          <text fg={theme().text.primary}>Custom background color</text>
        </Card>
      </box>
    </box>
  );
}
