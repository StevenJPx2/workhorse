/**
 * Types for app-content components
 */

import type { UseAtlassianReturn } from "../../hooks/use-atlassian/index.ts";
import type { UseConfigReturn } from "../../hooks/use-config/index.ts";

/** Props for AppContent component */
export interface AppContentProps {
  showAll?: boolean;
}

/** Props for inner content components */
export interface AppContentInnerProps {
  showAll?: boolean;
  rig: string | undefined;
  loading: boolean;
  atlassian: UseAtlassianReturn;
  config: UseConfigReturn;
  onQuit: () => void | Promise<void>;
}
