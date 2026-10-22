import type { PeerName } from "../policy/index.ts";

/** The binding name of the TLS service that dials one peer. Names cannot contain ":". */
export function peerBinding(peer: PeerName): `peer:${string}` {
  return `peer:${peer}`;
}
