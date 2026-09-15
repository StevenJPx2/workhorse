// Request authentication tiers.
//
//   public — the route authenticates itself (webhook signatures)
//   scoped — the sandbox callback token, which untrusted repo code holds
//   master — the fleet bearer (SPIKE_TOKEN)
//
// The scoped/master split is the whole point: a ticket sandbox runs code from
// arbitrary repos, so it gets a token that can read the fleet but not command it.

export type Auth = "public" | "scoped" | "master";

/** Which tiers a request satisfies. */
export interface Tiers {
  scoped: boolean;
  master: boolean;
}

/**
 * Constant-time string comparison.
 *
 * `a === b` short-circuits at the first differing byte, so response time leaks
 * how much of a guessed prefix was correct. That is a real oracle against a
 * bearer token, and it is cheap to remove.
 */
export function safeEqual(a: string, b: string): boolean {
  // Length is not secret (the tokens have fixed formats), but comparing unequal
  // lengths byte-wise would read out of bounds, so reject early.
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The bearer token from an Authorization header, or "" when absent/malformed. */
export function bearer(header: string | null | undefined): string {
  if (!header) return "";

  // Case-insensitive scheme per RFC 7235; some senders use "bearer".
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() ?? "";
}

export interface TokenConfig {
  /** The fleet master bearer. */
  master: string;
  /** Scoped sandbox-callback token. Optional: absent means no scoped tier. */
  scoped?: string;
}

/**
 * Resolve which tiers a request satisfies.
 *
 * Master implies scoped — an operator with the master key can do anything the
 * sandbox can.
 */
export function resolveTiers(header: string | null | undefined, tokens: TokenConfig): Tiers {
  const presented = bearer(header);

  // An empty configured token must never authenticate an empty header. Without
  // this, an unset SPIKE_TOKEN would make every unauthenticated request master.
  const master = !!tokens.master && !!presented && safeEqual(presented, tokens.master);
  const scoped = master || (!!tokens.scoped && !!presented && safeEqual(presented, tokens.scoped));

  return { scoped, master };
}

/** Whether a request satisfying `tiers` may enter a route needing `required`. */
export function permits(required: Auth, tiers: Tiers): boolean {
  if (required === "public") return true;
  if (required === "scoped") return tiers.scoped;
  return tiers.master;
}
