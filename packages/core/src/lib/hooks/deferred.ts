/**
 * Deferred hook wrapper that buffers specific hook emissions during plugin setup.
 *
 * During the setup phase, emissions for specified hook types are buffered.
 * After all plugins have initialized their listeners, the buffer is flushed
 * to replay any events that were emitted before listeners were ready.
 *
 * This solves the chicken-and-egg problem where plugin A emits a hook
 * that plugin B wants to listen to, but B's setup() hasn't run yet.
 */
import type { HookKeys, Hookable } from "hookable";

import type { HookCallbacks, HookPayload } from "./types.ts";

/** Hook types that should be deferred during plugin setup */
const DEFERRED_HOOKS = new Set<keyof HookCallbacks>(["tui.register_renderer"]);

interface BufferedEvent<K extends keyof HookCallbacks = keyof HookCallbacks> {
  type: K;
  payload: HookPayload<K>;
}

/**
 * Create a deferred hook system that wraps a hookable instance.
 *
 * @param hooks - The underlying hookable instance
 * @returns Object with startBuffering/flush to control buffering
 */
export function createDeferredHooks(hooks: Hookable<HookCallbacks>) {
  const buffer: BufferedEvent[] = [];
  let isBuffering = false;

  // Store original callHook
  const originalCallHook = hooks.callHook.bind(hooks);

  // Override callHook to intercept deferred hooks
  hooks.callHook = (<K extends keyof HookCallbacks>(
    type: K,
    payload: HookPayload<K>,
  ) => {
    if (isBuffering && DEFERRED_HOOKS.has(type)) {
      buffer.push({ type, payload } as BufferedEvent);
      return;
    }
    return originalCallHook(type as HookKeys<HookCallbacks>, payload as any);
  }) as typeof hooks.callHook;

  /**
   * Start buffering deferred hook emissions.
   * Call this before plugin setup begins.
   */
  function startBuffering() {
    isBuffering = true;
    buffer.length = 0;
  }

  /**
   * Stop buffering and replay all buffered events.
   * Call this after all plugins have completed setup.
   */
  async function flush() {
    isBuffering = false;
    for (const { type, payload } of buffer) {
      await originalCallHook(type as HookKeys<HookCallbacks>, payload as any);
    }
    buffer.length = 0;
  }

  return {
    startBuffering,
    flush,
    /** Check if currently buffering */
    get isBuffering() {
      return isBuffering;
    },
    /** Get current buffer size (for debugging) */
    get bufferSize() {
      return buffer.length;
    },
  };
}

export type DeferredHooks = ReturnType<typeof createDeferredHooks>;
