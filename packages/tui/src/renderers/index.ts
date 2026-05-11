/**
 * Unified activity renderer exports.
 */

export type {
  ActivityInput,
  ActivityRenderer,
  RenderedActivity,
  RegisterRendererPayload,
} from "./types.ts";

export { registerRenderer, render, getRegisteredIds, clearRenderers } from "./registry.ts";
