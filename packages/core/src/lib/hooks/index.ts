import mitt from "mitt";
import type { HookEventMap } from "./types.ts";

export const hooks = mitt<HookEventMap>();

export type { HookEventMap, PromptContext, AgentInstance } from "./types.ts";
