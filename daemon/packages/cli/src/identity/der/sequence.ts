import { concat } from "./concat.ts";
import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** SEQUENCE of already-encoded elements, in order. */
export function sequence(items: readonly Uint8Array[]): Uint8Array {
  return element(Tag.sequence, concat(items));
}
