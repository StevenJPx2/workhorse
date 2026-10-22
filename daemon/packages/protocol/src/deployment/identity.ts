import { Schema } from "effect";
import { PublicKey } from "../policy/index.ts";

/**
 * This daemon's Ed25519 key pair as a JWK, written by `workhorse install` and readable only by
 * its owner. `x` is the public key peers pin; `d` is the private key, which never leaves the daemon.
 */
export const Identity = Schema.Struct({
  kty: Schema.Literal("OKP"),
  crv: Schema.Literal("Ed25519"),
  x: PublicKey,
  d: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/)),
});
