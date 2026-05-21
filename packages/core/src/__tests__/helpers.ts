/**
 * Shared test helpers for workhorse-core tests.
 *
 * @module __tests__/helpers
 */

import mitt from "mitt";

import type { HookEmitter, HookEventMap } from "../lib/hooks/types.ts";

/**
 * Create a mock HookEmitter for testing.
 * Wraps mitt to provide the HookEmitter interface.
 */
export function createMockHooks(): HookEmitter {
  const emitter = mitt<HookEventMap>();

  return {
    on(name: string, handler: (payload: any) => void | Promise<void>): () => void {
      emitter.on(name as keyof HookEventMap, handler);
      return () => emitter.off(name as keyof HookEventMap, handler);
    },

    emit(name: string, payload: any): void {
      emitter.emit(name as keyof HookEventMap, payload);
    },

    async callHook(name: string, payload: any): Promise<void> {
      // Call all handlers and wait for promises
      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((emitter.all.get(name as keyof HookEventMap) ?? []) as Array<(payload: any) => any>).map(
          async (handler) => {
            await handler(payload);
          },
        ),
      );
    },

    off(name: string, handler: (payload: any) => void | Promise<void>): void {
      emitter.off(name as keyof HookEventMap, handler);
    },

    all: {
      clear: () => emitter.all.clear(),
    },
  };
}
