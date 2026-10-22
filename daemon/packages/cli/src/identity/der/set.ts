import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** SET OF exactly one element, so DER's sorting rule never applies. */
export function set(item: Uint8Array): Uint8Array {
  return element(Tag.set, item);
}
