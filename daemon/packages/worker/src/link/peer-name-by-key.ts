import type { Policy } from "@workhorse/protocol";

/** The name of the paired peer with this public key, or undefined. Routing only: the handshake proves the key. */
export function peerNameByKey(policy: Policy, key: string): string | undefined {
  return Object.entries(policy.peers ?? {}).find(([, peer]) => peer.key === key)?.[0];
}
