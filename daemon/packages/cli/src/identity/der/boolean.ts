import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** BOOLEAN; DER encodes true as 0xff. */
export function boolean(value: boolean): Uint8Array {
  return element(Tag.boolean, Uint8Array.of(value ? 0xff : 0x00));
}
