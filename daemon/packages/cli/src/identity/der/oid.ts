import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** OBJECT IDENTIFIER from dotted text such as "2.5.4.3": base-128 arcs, high bit on all but last. */
export function oid(dotted: string): Uint8Array {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [40 * first + second];

  for (const arc of rest) {
    const groups = [arc % 0x80];

    for (let high = Math.floor(arc / 0x80); high > 0; high = Math.floor(high / 0x80))
      groups.unshift(0x80 | (high % 0x80));
    bytes.push(...groups);
  }

  return element(Tag.oid, Uint8Array.from(bytes));
}
