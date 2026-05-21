import type { ConfigPaths, WorkhorseConfig } from "#config";
import type { Database } from "#db";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";
import type { MonitorService } from "#services";
import type { HarnessOrchestrator } from "#workflow";
import type { Tracker } from "#workflow";

/**
 * The Workhorse context available everywhere within the app lifecycle.
 */
export interface WorkhorseContext {
  readonly config: WorkhorseConfig;
  readonly paths: ConfigPaths;
  readonly hooks: HookEmitter;
  /** Database access */
  readonly db: Database;
  /** Memory service for L1 session memory and L2 semantic search */
  readonly memory: MemoryService;
  /** Monitor service for polling framework */
  readonly monitors: MonitorService;
  /** Tracker for parsing input and building prompts */
  readonly tracker: Tracker;
  /** Orchestrator for managing agent lifecycles */
  readonly orchestrator: HarnessOrchestrator;
}
