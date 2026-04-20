import mitt from "mitt";
import type { HookEventMap } from "./types.ts";

export const hooks = mitt<HookEventMap>();

export type { HookEventMap } from "./types.ts";
export type { PromptContext } from "./types.ts";
