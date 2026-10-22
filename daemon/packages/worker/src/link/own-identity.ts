import { Identity } from "@workhorse/protocol";
import { Effect, Option, Schema } from "effect";
import type { Env } from "../env.ts";
import { LinkError } from "./link-error.ts";

/** This daemon's public key, and its private key, which can only sign. */
export type OwnIdentity = { readonly key: string; readonly privateKey: CryptoKey };

const decodeIdentity = Schema.decodeUnknownOption(Identity);

/** This daemon's identity from the `IDENTITY` binding, decoded and imported for signing. */
export const ownIdentity = Effect.fnUntraced(function* (
  env: Env,
): Effect.fn.Return<OwnIdentity, LinkError> {
  const identity = Option.getOrUndefined(decodeIdentity(env.IDENTITY));

  if (identity === undefined) return yield* new LinkError({ message: "invalid identity" });

  const privateKey = yield* Effect.tryPromise({
    try: () => crypto.subtle.importKey("jwk", identity, { name: "Ed25519" }, false, ["sign"]),
    catch: () => new LinkError({ message: "cannot import the identity key" }),
  });

  return { key: identity.x, privateKey };
});
