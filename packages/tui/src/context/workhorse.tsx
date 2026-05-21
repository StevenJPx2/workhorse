import { createContext, useContext, type JSX } from "solid-js";
import type {
  WorkhorseConfig,
  ConfigPaths,
  HookEmitter,
  MemoryService,
  MonitorService,
  Tracker,
  HarnessOrchestrator,
} from "workhorse-core";

/**
 * Context value for the Workhorse TUI.
 * Provides access to core services and hooks.
 */
export interface WorkhorseContextValue {
  readonly config: WorkhorseConfig;
  readonly paths: ConfigPaths;
  readonly hooks: HookEmitter;
  readonly memory: MemoryService;
  readonly monitors: MonitorService;
  readonly tracker: Tracker;
  readonly orchestrator: HarnessOrchestrator;
}

const WorkhorseContext = createContext<WorkhorseContextValue>();

/**
 * Provider component that makes Workhorse services available to the TUI.
 */
export function WorkhorseProvider(props: {
  value: WorkhorseContextValue;
  children: JSX.Element;
}) {
  return (
    <WorkhorseContext.Provider value={props.value}>
      {props.children}
    </WorkhorseContext.Provider>
  );
}

/**
 * Hook to access Workhorse services from any component.
 * @throws Error if used outside of WorkhorseProvider
 */
export function useWorkhorseContext(): WorkhorseContextValue {
  const ctx = useContext(WorkhorseContext);
  if (!ctx) {
    throw new Error(
      "useWorkhorseContext must be used within WorkhorseProvider",
    );
  }
  return ctx;
}
