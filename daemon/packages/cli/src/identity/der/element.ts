import { concat } from "./concat.ts";
import { length } from "./length.ts";

/** One DER element: tag, definite length, contents. */
export function element(tag: number, contents: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(tag), length(contents.length), contents]);
}
