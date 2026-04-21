import type { Emitter } from "mitt";
import { Config } from "#config";
import { hooks } from "#hooks";
import type { HookEventMap } from "#hooks";
import type { JiratownConfig } from "#config";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Jiratown {
  /** Loaded configuration (readonly) */
  readonly config: Readonly<JiratownConfig>;

  /** Event hooks for pub/sub */
  readonly hooks: Emitter<HookEventMap>;

  /** Graceful shutdown */
  shutdown(): Promise<void>;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export async function bootstrap(repoRoot?: string): Promise<Jiratown> {
  // 1. Load config from files
  const config = new Config(repoRoot).get();

  // 2. Clear hooks for clean state
  hooks.all.clear();

  // 3. Build Jiratown instance
  return {
    config: Object.freeze(config),
    hooks,
    async shutdown() {
      hooks.all.clear();
    },
  };
}
