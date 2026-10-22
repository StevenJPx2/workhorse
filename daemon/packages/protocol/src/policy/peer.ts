import { Schema } from "effect";
import { MethodName } from "./names.ts";

/** An Ed25519 public key: its 32 raw bytes as unpadded base64url. */
export const PublicKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
);

export type PublicKey = typeof PublicKey.Type;

/** One PEM certificate, the peer's self-signed TLS certificate, which this daemon pins. */
export const Certificate = Schema.String.check(
  Schema.isPattern(
    /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]{1,64}\n)+-----END CERTIFICATE-----\n$/,
  ),
);

export type Certificate = typeof Certificate.Type;

/**
 * Where to dial a peer: `host:port`, the host a name, an IPv4 address, or a bracketed IPv6
 * address. Any network that reaches it works: a LAN, Tailscale, WireGuard.
 */
export const PeerAddress = Schema.String.check(
  Schema.isPattern(
    /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?):(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/,
  ),
);

/**
 * A paired daemon. `address` means this daemon dials it; `operations` are the public
 * operations it may call here, none by default.
 */
export const Peer = Schema.Struct({
  key: PublicKey,
  certificate: Certificate,
  address: Schema.optionalKey(PeerAddress),
  operations: Schema.Array(MethodName),
});

export type Peer = typeof Peer.Type;
