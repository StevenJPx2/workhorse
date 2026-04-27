/**
 * Adapter class constructor type.
 *
 * @module workflow/orchestrator/types/adapter-class
 */

import type { AdapterContext } from "./adapter-context.ts";
import type { AgentAdapter } from "./agent.ts";

/**
 * Adapter class constructor type.
 * Plugins register adapter classes that extend AgentAdapter.
 */
export type AdapterClass = new (ctx: AdapterContext) => AgentAdapter;
