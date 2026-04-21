import { createContext } from "unctx";
import { AsyncLocalStorage } from "node:async_hooks";
import type { JiratownContext } from "./types.ts";

const ctx = createContext<JiratownContext>({
  asyncContext: true,
  AsyncLocalStorage,
});

/**
 * Get the current Jiratown context.
 *
 * @throws If called outside of a Jiratown context scope
 */
export const useJiratown = ctx.use;

/**
 * Get the current Jiratown context, or undefined if not in context.
 */
export const tryUseJiratown = ctx.tryUse;

/**
 * Run a function within a Jiratown context.
 */
export const runWithContext = ctx.call;

/**
 * Set a singleton context (for tests or simple setups).
 * @internal Primarily used for testing
 */
// fallow-ignore-next-line unused-exports
export const setContext = ctx.set;

/**
 * Unset the singleton context.
 * @internal Primarily used for testing
 */
// fallow-ignore-next-line unused-exports
export const unsetContext = ctx.unset;

export type { JiratownContext } from "./types.ts";
