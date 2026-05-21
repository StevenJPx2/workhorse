import { useKeyboard } from "@opentui/solid";
import type { Accessor, Setter } from "solid-js";

import { ui } from "../../state/ui";

interface UseKeyboardNavOptions {
  isSearchFocused: Accessor<boolean>;
  setIsSearchFocused: Setter<boolean>;
  filteredModelsLength: Accessor<number>;
  onClose: () => void;
}

/** Keyboard navigation handler for the model selector modal. */
export function useModelSelectorKeyboard(options: UseKeyboardNavOptions) {
  const { isSearchFocused, setIsSearchFocused, filteredModelsLength, onClose } =
    options;

  useKeyboard((key) => {
    if (ui.modal() !== "model") return;

    if (key.name === "escape") {
      onClose();
      return;
    }

    // Tab to switch between search and list
    if (key.name === "tab") {
      setIsSearchFocused((prev) => !prev);
      return;
    }

    // When search is focused, arrow down moves to list
    if (isSearchFocused() && (key.name === "down" || key.name === "return")) {
      if (filteredModelsLength() > 0) {
        setIsSearchFocused(false);
      }
      return;
    }

    // When list is focused, typing letters or backspace focuses search
    if (!isSearchFocused()) {
      if (key.name === "backspace") {
        setIsSearchFocused(true);
        return;
      }

      // Single printable character - just focus search, input will receive the key
      if (
        key.sequence &&
        key.sequence.length === 1 &&
        /^[a-zA-Z0-9\-_. ]$/.test(key.sequence)
      ) {
        setIsSearchFocused(true);
        return;
      }
    }
  });
}
