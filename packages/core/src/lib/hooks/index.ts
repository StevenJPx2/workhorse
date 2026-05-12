import mitt from "mitt";
import type { HookEventMap } from "./types.ts";
import { createDeferredHooks } from "./deferred.ts";

export const hooks = mitt<HookEventMap>();

// Deferred hook helpers for buffering during plugin setup
export const deferredHooks = createDeferredHooks(hooks);

export type { HookEmitter, HookEventMap, HookEventName } from "./types.ts";
export type { PromptBuildingContext, PromptContextBlock } from "#workflow/tracker";
