/**
 * API token form state and keyboard handling hook.
 */

import { createSignal } from "solid-js";
import type { ApiTokenAuthField } from "workhorse-core";

export interface ApiTokenFormState {
  values: Record<string, string>;
  fieldIndex: number;
  inputMode: boolean;
  inputBuffer: string;
  error: string | undefined;
}

export function useApiTokenForm() {
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [fieldIndex, setFieldIndex] = createSignal(0);
  const [inputMode, setInputMode] = createSignal(false);
  const [inputBuffer, setInputBuffer] = createSignal("");
  const [error, setError] = createSignal<string | undefined>();

  function reset(initialValues: Record<string, string> = {}) {
    setValues(initialValues);
    setFieldIndex(0);
    setInputMode(false);
    setInputBuffer("");
    setError(undefined);
  }

  function handleKeyboard(
    event: { name?: string; raw?: string },
    fields: ApiTokenAuthField[],
    onCancel: () => void,
    onSubmit: () => void,
  ) {
    if (!fields.length) return;

    const currentField = fields[fieldIndex()];

    // Input mode handling (typing in a field)
    if (inputMode()) {
      if (event.name === "escape") {
        setInputMode(false);
        if (currentField) setInputBuffer(values()[currentField.key] || "");
        return;
      }
      if (event.name === "return") {
        if (currentField) {
          const value = inputBuffer().trim();
          if (currentField.required && !value) {
            setError(`${currentField.label} is required`);
            return;
          }
          setValues((prev) => ({ ...prev, [currentField.key]: value }));
          setError(undefined);
        }
        setInputMode(false);
        // Move to next field
        if (fieldIndex() < fields.length - 1) {
          setFieldIndex((i) => i + 1);
          const nextField = fields[fieldIndex() + 1];
          if (nextField) setInputBuffer(values()[nextField.key] || "");
        }
        return;
      }
      if (event.name === "backspace") {
        setInputBuffer((b) => b.slice(0, -1));
        return;
      }
      if (event.raw && event.raw.length === 1 && event.raw.charCodeAt(0) >= 32) {
        setInputBuffer((b) => b + event.raw);
      }
      return;
    }

    // Navigation mode
    if (event.name === "escape") {
      onCancel();
      return;
    }
    if (event.name === "up" || event.name === "k") {
      if (fieldIndex() > 0) setFieldIndex((i) => i - 1);
      return;
    }
    if (event.name === "down" || event.name === "j") {
      if (fieldIndex() < fields.length - 1) setFieldIndex((i) => i + 1);
      return;
    }
    if (event.name === "return") {
      if (currentField) {
        setInputBuffer(values()[currentField.key] || "");
        setInputMode(true);
        setError(undefined);
      }
      return;
    }
    if (event.name === "tab") {
      // Validate all required fields
      for (const field of fields) {
        if (field.required && !values()[field.key]) {
          setError(`${field.label} is required`);
          const idx = fields.findIndex((f) => f.key === field.key);
          if (idx >= 0) setFieldIndex(idx);
          return;
        }
      }
      onSubmit();
    }
  }

  return {
    values,
    setValues,
    fieldIndex,
    setFieldIndex,
    inputMode,
    inputBuffer,
    error,
    setError,
    reset,
    handleKeyboard,
  };
}
