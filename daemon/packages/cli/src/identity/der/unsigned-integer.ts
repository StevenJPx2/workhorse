import { concat } from "./concat.ts";
import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** A non-negative INTEGER from big-endian magnitude bytes, minimally encoded. */
export function unsignedInteger(magnitude: Uint8Array): Uint8Array {
  let start = 0;

  while (start < magnitude.length - 1 && magnitude[start] === 0) start += 1;
  const trimmed = magnitude.subarray(start);
  const first = trimmed[0] ?? 0;

  // A set high bit would read as negative, so a zero byte goes first.
  return element(Tag.integer, first >= 0x80 ? concat([Uint8Array.of(0), trimmed]) : trimmed);
}
