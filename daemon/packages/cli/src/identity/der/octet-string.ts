import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** OCTET STRING; X.509 extensions wrap their encoded value in one. */
export function octetString(contents: Uint8Array): Uint8Array {
  return element(Tag.octetString, contents);
}
