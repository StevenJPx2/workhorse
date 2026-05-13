import { AsyncLocalStorage } from "node:async_hooks";
import { createContext } from "unctx";
import type { WorkhorseContext } from "./types.ts";

const ctx = createContext<WorkhorseContext>({
  asyncContext: true,
  AsyncLocalStorage,
});

/**
 * Get the current Workhorse context.
 *
 * @throws If called outside of a Workhorse context scope
 */
export const useWorkhorse = ctx.use;

/**
 * Get the current Workhorse context, or undefined if not in context.
 */
export const tryUseWorkhorse = ctx.tryUse;

/**
 * Run a function within a Workhorse context.
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

export type { WorkhorseContext } from "./types.ts";
