/**
 * Types for the Auth screen.
 */

import type { PluginAuthRequirement } from "../../setup/auth.ts";

export type AuthFlowState =
  | { phase: "idle" }
  | { phase: "authenticating"; pluginName: string }
  | { phase: "waiting-browser"; pluginName: string; authUrl: string }
  | { phase: "waiting-cli"; pluginName: string }
  | { phase: "success"; pluginName: string }
  | { phase: "error"; pluginName: string; error: string };

export interface AuthScreenProps {
  /** Plugins that need authentication */
  plugins: PluginAuthRequirement[];
  /** Called when all plugins are authenticated */
  onComplete: () => void;
  /** Called when user wants to skip auth (optional) */
  onSkip?: () => void;
}
