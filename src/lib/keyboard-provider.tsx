/**
 * KeyboardProvider component - Provides keyboard context to app
 */

import type { ParentComponent } from "solid-js";
import { KeyboardContext, createKeyboardValue } from "./keyboard-context.ts";

/**
 * Provider component for keyboard context
 *
 * @example
 * <KeyboardProvider>
 *   <App />
 * </KeyboardProvider>
 */
export const KeyboardProvider: ParentComponent = (props) => {
  const value = createKeyboardValue();

  return (
    <KeyboardContext.Provider value={value}>
      {props.children}
    </KeyboardContext.Provider>
  );
};
