import { Schema } from "effect";
import { PublicKey } from "../policy/index.ts";

/** 32 random bytes as unpadded base64url; each side's challenge to the other. */
export const Nonce = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/));

export type Nonce = typeof Nonce.Type;

/** An Ed25519 signature: its 64 raw bytes as unpadded base64url. */
export const Signature = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{85}[AQgw]$/));

/** `link.hello` params: the dialer's first message, with the versions it speaks. */
export const LinkHelloParams = Schema.Struct({
  protocol: Schema.NonEmptyArray(Schema.Int),
  key: PublicKey,
  nonce: Nonce,
});

export type LinkHelloParams = typeof LinkHelloParams.Type;

/** `link.hello` result: the acceptor's version, key, nonce, and its signature over the transcript. */
export const LinkHelloResult = Schema.Struct({
  protocol: Schema.Int,
  key: PublicKey,
  nonce: Nonce,
  signature: Signature,
});

export type LinkHelloResult = typeof LinkHelloResult.Type;

/** `link.prove` params: the dialer's signature over the transcript. The result is `{}`. */
export const LinkProveParams = Schema.Struct({
  signature: Signature,
});

export type LinkProveParams = typeof LinkProveParams.Type;
