import mitt from "mitt";
import type { HookEventMap } from "./types.ts";

export const hooks = mitt<HookEventMap>();

export type {
  HookEmitter,
  HookEventMap,
  HookEventName,
  PromptBuildingContext,
  PromptContextBlock,
} from "./types.ts";
