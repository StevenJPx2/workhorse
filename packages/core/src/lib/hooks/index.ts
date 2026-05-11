import mitt from "mitt";
import type { HookEventMap } from "./types.ts";

export const hooks = mitt<HookEventMap>();

export type { HookEmitter, HookEventMap, HookEventName } from "./types.ts";
export type { PromptBuildingContext, PromptContextBlock } from "#workflow/tracker";
