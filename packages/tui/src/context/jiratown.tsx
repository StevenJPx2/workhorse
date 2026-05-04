import { createContext, useContext, type JSX } from "solid-js";
import type {
  JiratownConfig,
  ConfigPaths,
  HookEmitter,
  MemoryService,
  Tracker,
  HarnessOrchestrator,
} from "@jiratown/core";

/**
 * Context value for the Jiratown TUI.
 * Provides access to core services and hooks.
 */
export interface JiratownContextValue {
  readonly config: JiratownConfig;
  readonly paths: ConfigPaths;
  readonly hooks: HookEmitter;
  readonly memory: MemoryService;
  readonly tracker: Tracker;
  readonly orchestrator: HarnessOrchestrator;
}

const JiratownContext = createContext<JiratownContextValue>();

/**
 * Provider component that makes Jiratown services available to the TUI.
 */
export function JiratownProvider(props: { value: JiratownContextValue; children: JSX.Element }) {
  return <JiratownContext.Provider value={props.value}>{props.children}</JiratownContext.Provider>;
}

/**
 * Hook to access Jiratown services from any component.
 * @throws Error if used outside of JiratownProvider
 */
export function useJiratownContext(): JiratownContextValue {
  const ctx = useContext(JiratownContext);
  if (!ctx) {
    throw new Error("useJiratownContext must be used within JiratownProvider");
  }
  return ctx;
}
