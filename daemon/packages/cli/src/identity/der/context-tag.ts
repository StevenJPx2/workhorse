import { element } from "./element.ts";

/** How a context-specific tag wraps its contents. */
export type Tagging = "explicit" | "implicit";

/**
 * A context-specific tag `[number]`: "explicit" wraps an encoded element (constructed),
 * "implicit" replaces a primitive string's tag.
 */
export function contextTag(number: number, tagging: Tagging, contents: Uint8Array): Uint8Array {
  return element((tagging === "explicit" ? 0xa0 : 0x80) | number, contents);
}
