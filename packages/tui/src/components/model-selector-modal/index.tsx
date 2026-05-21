import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, createSignal, onMount } from "solid-js";

import { useWorkhorseContext } from "../../context/workhorse.tsx";
import { ui } from "../../state/ui";
import { getTheme } from "../../theme.ts";
import { useModelSelectorKeyboard } from "./use-keyboard-nav.ts";

interface ModelSelectorModalProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

/** Modal for selecting the AI model to use. */
export function ModelSelectorModal(props: ModelSelectorModalProps) {
  const theme = getTheme();
  const { orchestrator } = useWorkhorseContext();
  const dimensions = useTerminalDimensions();

  const [searchQuery, setSearchQuery] = createSignal("");
  const [isSearchFocused, setIsSearchFocused] = createSignal(false);

  onMount(() => {
    // Delay focus to next tick to avoid capturing the triggering keystroke (e.g., "m" from Ctrl+X m)
    setTimeout(() => setIsSearchFocused(true), 0);
  });

  const allModels = createMemo(() => orchestrator.getAllModels());

  const filteredModels = createMemo(() => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return allModels();
    return allModels().filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query),
    );
  });

  const initialIndex = createMemo(() => {
    const idx = filteredModels().findIndex((m) => m.id === props.currentModel);
    return idx >= 0 ? idx : 0;
  });

  const selectOptions = createMemo(() =>
    filteredModels().map((m) => ({
      name: `${m.name}${m.isDefault ? " ★" : ""}`,
      description: `${m.provider} · ${m.contextWindow >= 1000000 ? `${(m.contextWindow / 1000000).toFixed(1)}M` : `${Math.round(m.contextWindow / 1000)}K`} context`,
      value: m.id,
    })),
  );

  const modalMaxHeight = () =>
    Math.max(14, Math.floor(dimensions().height * 0.8));
  const selectHeight = () => Math.max(4, modalMaxHeight() - 11);

  useModelSelectorKeyboard({
    isSearchFocused,
    setIsSearchFocused,
    filteredModelsLength: () => filteredModels().length,
    onClose: props.onClose,
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
          <text
            fg={theme.colors.dim}
          >{` (${filteredModels().length}/${allModels().length})`}</text>
        </box>

        {/* Search input */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <box
            flexDirection="row"
            backgroundColor={
              isSearchFocused()
                ? theme.colors.selection
                : theme.colors.background
            }
            paddingLeft={1}
            paddingRight={1}
            width="100%"
          >
            <text fg={theme.colors.dim}>🔍 </text>
            <input
              width={50}
              focused={isSearchFocused() && ui.modal() === "model"}
              placeholder="Search models..."
              value={searchQuery()}
              onInput={(value) => setSearchQuery(value)}
            />
          </box>
        </box>

        {/* Model list */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1} flexGrow={1}>
          {filteredModels().length > 0 ? (
            <select
              width={54}
              height={selectHeight()}
              options={selectOptions()}
              selectedIndex={initialIndex()}
              focused={!isSearchFocused() && ui.modal() === "model"}
              backgroundColor={theme.colors.surface}
              focusedBackgroundColor={theme.colors.surface}
              textColor={theme.colors.text}
              focusedTextColor={theme.colors.text}
              selectedBackgroundColor={theme.colors.selection}
              selectedTextColor={theme.colors.accent}
              descriptionColor={theme.colors.dim}
              selectedDescriptionColor={theme.colors.info}
              showDescription={true}
              showScrollIndicator={true}
              onSelect={(index) => {
                const model = filteredModels()[index];
                if (model) props.onSelect(model.id);
              }}
            />
          ) : (
            <box paddingTop={2}>
              <text fg={theme.colors.dim}>
                No models match "{searchQuery()}"
              </text>
            </box>
          )}
        </box>

        {/* Actions */}
        <box
          backgroundColor={theme.colors.background}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.colors.dim}>
            Tab switch | Enter select | Esc cancel | ↑↓ navigate
          </text>
        </box>
      </box>
    </box>
  );
}
