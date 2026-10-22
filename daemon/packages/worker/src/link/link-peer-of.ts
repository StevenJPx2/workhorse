import type { LinkPeer } from "@workhorse/core";
import type { Policy } from "@workhorse/protocol";

/** A peer the policy pairs with, as the link rules see it, and where to dial it if anywhere. */
export type PairedPeer = LinkPeer & { readonly address: string | undefined };

/** The policy's peer `name`, or undefined when it is not paired. */
export function linkPeerOf(policy: Policy, name: string): PairedPeer | undefined {
  const peer = Object.hasOwn(policy.peers ?? {}, name) ? policy.peers?.[name] : undefined;

  if (peer === undefined) return undefined;

  return { name, key: peer.key, operations: new Set(peer.operations), address: peer.address };
}
