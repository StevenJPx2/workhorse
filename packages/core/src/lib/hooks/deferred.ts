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

import type { Emitter } from "mitt";
import type { HookEventMap } from "./types.ts";

/** Hook types that should be deferred during plugin setup */
const DEFERRED_HOOKS = new Set<keyof HookEventMap>(["tui.register_renderer"]);

interface BufferedEvent {
  type: keyof HookEventMap;
  payload: HookEventMap[keyof HookEventMap];
}

/**
 * Create a deferred hook system that wraps a mitt instance.
 *
 * @param emitter - The underlying mitt emitter
 * @returns Object with startBuffering/flush to control buffering
 */
export function createDeferredHooks(emitter: Emitter<HookEventMap>) {
  const buffer: BufferedEvent[] = [];
  let isBuffering = false;

  // Store original emit
  const originalEmit = emitter.emit.bind(emitter);

  // Override emit to intercept deferred hooks
  emitter.emit = (<K extends keyof HookEventMap>(type: K, payload: HookEventMap[K]) => {
    if (isBuffering && DEFERRED_HOOKS.has(type)) {
      buffer.push({ type, payload });
    } else {
      originalEmit(type, payload);
    }
  }) as typeof emitter.emit;

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
  function flush() {
    isBuffering = false;
    for (const { type, payload } of buffer) {
      originalEmit(type, payload);
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
