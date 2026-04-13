/**
 * Navigation provider component
 */

import type { ParentComponent } from "solid-js";
import { NavigationContext, createNavigationValue } from "./navigation-context.ts";

/**
 * Provider for navigation state
 */
export const NavigationProvider: ParentComponent = (props) => {
  const value = createNavigationValue();

  return <NavigationContext.Provider value={value}>{props.children}</NavigationContext.Provider>;
};
