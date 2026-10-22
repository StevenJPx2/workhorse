import type { PublicKey } from "../policy/index.ts";
import type { Nonce } from "./handshake.ts";

/** Which side of a link signs. */
export type LinkRole = "dialer" | "acceptor";

/** One side's contribution to the handshake. */
export type LinkSide = { readonly key: PublicKey; readonly nonce: Nonce };

/**
 * The bytes a side signs to prove its key. They name the signer's role, so a signature cannot
 * be replayed as the other side's, and both keys and both fresh nonces, so it cannot be replayed
 * on another link. Every field has a fixed length and alphabet, so the joined text is unambiguous.
 */
export function linkTranscript(signer: LinkRole, dialer: LinkSide, acceptor: LinkSide): Uint8Array {
  const fields = [
    "workhorse-link-v1",
    signer,
    dialer.key,
    acceptor.key,
    dialer.nonce,
    acceptor.nonce,
  ];

  return new TextEncoder().encode(fields.join("\n"));
}
