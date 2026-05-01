/**
 * Keyboard handler hook for the Setup screen.
 */

import { useKeyboard } from "@opentui/solid";
import type { Accessor, Setter } from "solid-js";
import type { SetupPluginConfig } from "./types.ts";

interface UseSetupKeyboardOptions {
  inputMode: Accessor<boolean>;
  setInputMode: Setter<boolean>;
  inputBuffer: Accessor<string>;
  setInputBuffer: Setter<string>;
  currentPluginIndex: Accessor<number>;
  setCurrentPluginIndex: Setter<number>;
  currentFieldIndex: Accessor<number>;
  setCurrentFieldIndex: Setter<number>;
  plugins: SetupPluginConfig[];
  values: Accessor<Record<string, Record<string, string>>>;
  setValues: Setter<Record<string, Record<string, string>>>;
  setError: Setter<string | null>;
  onComplete: (configs: Record<string, Record<string, string>>) => void;
  onSkip?: () => void;
}

export function useSetupKeyboard(options: UseSetupKeyboardOptions) {
  const {
    inputMode,
    setInputMode,
    inputBuffer,
    setInputBuffer,
    currentPluginIndex,
    setCurrentPluginIndex,
    currentFieldIndex,
    setCurrentFieldIndex,
    plugins,
    values,
    setValues,
    setError,
    onComplete,
    onSkip,
  } = options;

  const currentPlugin = () => plugins[currentPluginIndex()];
  const currentField = () => currentPlugin()?.fields[currentFieldIndex()];

  const hasRequiredMissing = () => {
    const plugin = currentPlugin();
    if (!plugin) return false;
    const pluginValues = values()[plugin.name] ?? {};
    return plugin.fields.some((f) => f.required && !pluginValues[f.key] && !f.value);
  };

  const loadFieldValue = () => {
    const plugin = currentPlugin();
    const field = currentField();
    if (!plugin || !field) return;
    setInputBuffer(values()[plugin.name]?.[field.key] ?? field.value ?? field.default ?? "");
    setError(null);
  };

  const saveCurrentField = () => {
    const plugin = currentPlugin();
    const field = currentField();
    if (!plugin || !field) return;

    const val = inputBuffer().trim();
    if (field.required && !val) {
      setError(`${field.label} is required`);
      return false;
    }

    setValues((prev) => ({
      ...prev,
      [plugin.name]: { ...prev[plugin.name], [field.key]: val },
    }));
    setError(null);
    return true;
  };

  const moveToNextField = () => {
    const plugin = currentPlugin();
    if (!plugin) return;

    if (currentFieldIndex() < plugin.fields.length - 1) {
      setCurrentFieldIndex((i) => i + 1);
      loadFieldValue();
    } else if (currentPluginIndex() < plugins.length - 1) {
      setCurrentPluginIndex((i) => i + 1);
      setCurrentFieldIndex(0);
      loadFieldValue();
    } else if (!hasRequiredMissing()) {
      onComplete(values());
    }
  };

  const moveToPrevField = () => {
    if (currentFieldIndex() > 0) {
      setCurrentFieldIndex((i) => i - 1);
      loadFieldValue();
    } else if (currentPluginIndex() > 0) {
      setCurrentPluginIndex((i) => i - 1);
      const prevPlugin = plugins[currentPluginIndex() - 1];
      if (prevPlugin) {
        setCurrentFieldIndex(prevPlugin.fields.length - 1);
      }
      loadFieldValue();
    }
  };

  // Initialize field value
  loadFieldValue();

  useKeyboard((key) => {
    if (inputMode()) {
      if (key.name === "escape") {
        setInputMode(false);
        loadFieldValue();
        return;
      }
      if (key.name === "return") {
        if (saveCurrentField()) {
          setInputMode(false);
          moveToNextField();
        }
        return;
      }
      if (key.name === "backspace") {
        setInputBuffer((b) => b.slice(0, -1));
        return;
      }
      if (key.raw && key.raw.length === 1 && key.raw.charCodeAt(0) >= 32) {
        setInputBuffer((b) => b + key.raw);
      }
      return;
    }

    // Navigation mode
    if ((key.name === "q" || key.name === "escape") && onSkip) {
      onSkip();
      return;
    }
    if (key.name === "j" || key.name === "down") {
      moveToNextField();
      return;
    }
    if (key.name === "k" || key.name === "up") {
      moveToPrevField();
      return;
    }
    if (key.name === "return" || key.name === "e") {
      setInputMode(true);
      loadFieldValue();
      return;
    }
    if (key.name === "s" || key.raw === "S") {
      if (!hasRequiredMissing()) {
        onComplete(values());
      } else {
        setError("Please fill in all required fields");
      }
    }
  });

  return { currentPlugin, currentField };
}
