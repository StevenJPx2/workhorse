import type { Config } from "#config";
import type { hooks } from "#lib/hooks";

/**
 * The Jiratown context available everywhere within the app lifecycle.
 *
 * @remarks
 * Extended in later steps as services are added (db, memory, monitor, etc.).
 */
export interface JiratownContext {
  readonly config: Config;
  readonly hooks: typeof hooks;
}
