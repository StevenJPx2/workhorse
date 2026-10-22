import { toBase64url } from "@workhorse/protocol";
import { Effect } from "effect";

/** 32 random bytes for one link's handshake; never reused. */
export const freshNonce: Effect.Effect<string> = Effect.sync(() =>
  toBase64url(crypto.getRandomValues(new Uint8Array(32))),
);
