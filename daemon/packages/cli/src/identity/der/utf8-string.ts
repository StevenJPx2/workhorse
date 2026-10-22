import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** UTF8String. */
export function utf8String(text: string): Uint8Array {
  return element(Tag.utf8String, new TextEncoder().encode(text));
}
