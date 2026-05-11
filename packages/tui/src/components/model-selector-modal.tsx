import { createSignal, createMemo, For } from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { PiAdapterModelRegistry, type ModelInfo } from "@jiratown/plugin-pi-adapter";
import { getTheme } from "../theme.ts";
import { useJiratownContext } from "../context/jiratown.tsx";
import { ui } from "../state/ui.ts";

interface ModelSelectorModalProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

const registry = PiAdapterModelRegistry.getInstance();

/** Modal for selecting the AI model to use. */
export function ModelSelectorModal(props: ModelSelectorModalProps) {
  const theme = getTheme();
  const { config } = useJiratownContext();
  const dimensions = useTerminalDimensions();

  const models = createMemo(() => registry.getAll());

  // Find initial index based on current model
  const initialIndex = () => {
    const idx = models().findIndex((m) => m.id === props.currentModel);
    return idx >= 0 ? idx : 0;
  };

  const [selectedIndex, setSelectedIndex] = createSignal(initialIndex());

  // Calculate modal height: max 80% of terminal, min space for header/footer
  const modalMaxHeight = () => Math.max(12, Math.floor(dimensions().height * 0.8));
  // Model list height: modal height minus header (2 rows) - provider info (2 rows) - actions (2 rows) - borders (2 rows)
  const modelListHeight = () => Math.max(4, modalMaxHeight() - 8);

  useKeyboard((key) => {
    // Guard: only handle keys when this modal is actually open
    if (ui.modal() !== "model") return;

    if (key.name === "return") {
      const model = models()[selectedIndex()];
      if (model) {
        props.onSelect(model.id);
      }
      return;
    }
    if (key.name === "escape") {
      props.onClose();
      return;
    }
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => Math.min(models().length - 1, prev + 1));
    }
  });

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={1000}
      justifyContent="center"
      alignItems="center"
    >
      <box
        flexDirection="column"
        width={60}
        height={modalMaxHeight()}
        backgroundColor={theme.colors.surface}
        borderStyle="rounded"
        borderColor={theme.colors.accent}
      >
        {/* Header */}
        <box
          backgroundColor={theme.colors.selection}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.colors.accent}>
            <b>🤖 SELECT MODEL</b>
          </text>
        </box>

        {/* Current provider info */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <text fg={theme.colors.dim}>Provider: </text>
          <text fg={theme.colors.info}>
            <b>{registry.getPreferredProvider()}</b>
          </text>
          <text fg={theme.colors.dim}> | Current: </text>
          <text fg={theme.colors.success}>{config.agent.model || "default"}</text>
        </box>

        {/* Model list - scrollable to fit in constrained height */}
        <scrollbox height={modelListHeight()} paddingLeft={2} paddingRight={2} paddingTop={1}>
          <box flexDirection="column">
            <For each={models()}>
              {(model, index) => (
                <ModelRow
                  model={model}
                  isSelected={index() === selectedIndex()}
                  isCurrent={model.id === props.currentModel}
                />
              )}
            </For>
          </box>
        </scrollbox>

        {/* Actions */}
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          gap={3}
        >
          <box>
            <text fg={theme.colors.success}>
              <b>Enter</b>
            </text>
            <text fg={theme.colors.dim}> select</text>
          </box>
          <box>
            <text fg={theme.colors.warning}>
              <b>ESC</b>
            </text>
            <text fg={theme.colors.dim}> cancel</text>
          </box>
          <box>
            <text fg={theme.colors.accent}>
              <b>↑↓/jk</b>
            </text>
            <text fg={theme.colors.dim}> navigate</text>
          </box>
        </box>
      </box>
    </box>
  );
}

interface ModelRowProps {
  model: ModelInfo;
  isSelected: boolean;
  isCurrent: boolean;
}

function ModelRow(props: ModelRowProps) {
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
