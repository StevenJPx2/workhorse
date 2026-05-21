import { createHooks, type HookKeys } from "hookable";

import { createDeferredHooks } from "./deferred.ts";
import type { HookCallbacks, HookPayload, HookEmitter } from "./types.ts";

// Create the underlying hookable instance
const hookable = createHooks<HookCallbacks>();

/**
 * Compatibility wrapper around hookable that provides:
 * - `on(name, handler)` - register a hook handler (alias for hookable.hook)
 * - `emit(name, payload)` - fire-and-forget emit (does not await async handlers)
 * - `callHook(name, payload)` - awaitable emit (waits for all async handlers)
 *
 * Use `callHook` when you need to wait for async handlers (e.g., prompt.building).
 * Use `emit` for fire-and-forget events where you don't need to wait.
 */
export const hooks: HookEmitter = {
  /**
   * Register a hook handler.
   * @returns Unregister function
   */
  on<K extends keyof HookCallbacks>(
    name: K,
    handler: HookCallbacks[K],
  ): () => void {
    return hookable.hook(name as HookKeys<HookCallbacks>, handler as any);
  },

  /**
   * Fire-and-forget emit - does NOT wait for async handlers.
   * Use this for events where you don't need to wait for handlers to complete.
   */
  emit<K extends keyof HookCallbacks>(name: K, payload: HookPayload<K>): void {
    // Fire and forget - don't await
    hookable.callHook(name as HookKeys<HookCallbacks>, payload as any);
  },

  /**
   * Awaitable emit - waits for all handlers (including async) to complete.
   * Use this when you need to wait for handlers to finish (e.g., prompt.building).
   */
  callHook<K extends keyof HookCallbacks>(
    name: K,
    payload: HookPayload<K>,
  ): Promise<void> {
    return hookable.callHook(
      name as HookKeys<HookCallbacks>,
      payload as any,
    ) as Promise<void>;
  },

  /** Remove a specific handler */
  off<K extends keyof HookCallbacks>(name: K, handler: HookCallbacks[K]): void {
    hookable.removeHook(name as HookKeys<HookCallbacks>, handler as any);
  },

  /**
   * Access to internal handlers map for clearing all hooks.
   * Mimics mitt's `all` property for backwards compatibility.
   */
  all: {
    clear: () => hookable.removeAllHooks(),
  },
};

// Deferred hook helpers for buffering during plugin setup
export const deferredHooks = createDeferredHooks(hookable);

export type {
  HookEventMap,
  HookEventName,
  HookCallbacks,
  HookPayload,
  HookEmitter,
  DiscoveredLink,
} from "./types.ts";
export type { PromptBuildingContext, PromptContextBlock } from "#workflow";

// Hook metadata for documentation generation
export {
  CORE_HOOK_METADATA,
  getAllHookMetadata,
  registerHookMetadata,
  clearPluginHookMetadata,
  generateHooksMarkdown,
  generateHooksReference,
  type HookMetadata,
} from "./metadata.ts";
