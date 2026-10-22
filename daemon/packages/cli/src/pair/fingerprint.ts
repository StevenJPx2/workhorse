import { createHash } from "node:crypto";

/**
 * A short code for a key and certificate together, for a person to compare across two
 * machines: the first 64 bits of SHA-256, as four groups of hex. An attacker in the middle of a
 * pairing would have to make a different key and certificate produce the same code.
 */
export function fingerprint(key: string, certificate: string): string {
  const hex = createHash("sha256").update(`${key}\n${certificate}`).digest("hex").toUpperCase();

  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join("-");
}
