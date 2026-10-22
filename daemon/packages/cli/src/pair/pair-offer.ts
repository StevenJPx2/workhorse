import { Certificate, PublicKey } from "@workhorse/protocol";
import { Schema } from "effect";

/**
 * What each side of a pairing sends: the key and certificate the other will pin. The accepting
 * side also sends the port it accepts links on, so the dialing side knows where to dial.
 */
export const PairOffer = Schema.Struct({
  key: PublicKey,
  certificate: Certificate,
  linkPort: Schema.optionalKey(Schema.Int),
});

export type PairOffer = typeof PairOffer.Type;
