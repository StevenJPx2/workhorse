import type { ConfigPaths, JiratownConfig } from "#config";
import type { hooks } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import type { MonitorService } from "#services/monitor";
import type { HarnessOrchestrator } from "#workflow/orchestrator";
import type { Tracker } from "#workflow/tracker";

/**
 * The Jiratown context available everywhere within the app lifecycle.
 */
export interface JiratownContext {
  readonly config: JiratownConfig;
  readonly paths: ConfigPaths;
  readonly hooks: typeof hooks;
  /** Memory service for L1 session memory and L2 semantic search */
  readonly memory: MemoryService;
  /** Monitor service for polling framework */
  readonly monitors: MonitorService;
  /** Tracker for parsing input and building prompts */
  readonly tracker: Tracker;
  /** Orchestrator for managing agent lifecycles */
  readonly orchestrator: HarnessOrchestrator;
}
