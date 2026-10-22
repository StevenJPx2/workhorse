import { concat } from "./concat.ts";
import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** BIT STRING of whole bytes: a leading zero says no bits are unused. */
export function bitString(contents: Uint8Array): Uint8Array {
  return element(Tag.bitString, concat([Uint8Array.of(0), contents]));
}
