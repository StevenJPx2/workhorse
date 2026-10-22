import { realpathSync } from "node:fs";
import { Console, Effect } from "effect";
import { readPublicIdentity } from "../identity/read-public-identity.ts";
import { InstallError } from "../inputs.ts";
import { layoutOf } from "../layout.ts";
import { acceptPairing } from "./accept-pairing.ts";
import { addPeer } from "./add-peer.ts";
import { confirm } from "./confirm.ts";
import { dialPairing } from "./dial-pairing.ts";
import { fingerprint } from "./fingerprint.ts";
import { linkPort } from "./link-port.ts";
import type { PairSide } from "./pair-side.ts";
import { peerEntry } from "./peer-entry.ts";

/** One pairing: this daemon's base and policy file, the name it will call the peer, and its side. */
export type PairOptions = {
  readonly base: string;
  readonly policy: string;
  readonly name: string;
  readonly side: PairSide;
};

/**
 * Pair with another daemon: swap keys and certificates, show both fingerprints, and add the peer
 * to the policy only once you confirm they match on both machines. The dialing side records the
 * address to dial. A new peer may call nothing until you list operations; install applies it.
 */
export const pair = Effect.fnUntraced(function* (
  options: PairOptions,
): Effect.fn.Return<void, InstallError> {
  const layout = layoutOf(realpathSync(options.base));
  const own = yield* readPublicIdentity(layout);

  const theirs =
    options.side.type === "accept"
      ? yield* acceptPairing(options.side.listen, {
          ...own,
          linkPort: yield* linkPort(layout.listen),
        })
      : yield* dialPairing(options.side.address, own);

  yield* Console.log(
    `this daemon  ${fingerprint(own.key, own.certificate)}\n${options.name.padEnd(12)} ${fingerprint(theirs.key, theirs.certificate)}\n` +
      "The other machine shows the same two codes, the other way round.",
  );

  if (!(yield* confirm("Do they match? [y/N] ")))
    return yield* new InstallError({ message: "not paired: the codes were not confirmed" });

  yield* addPeer(options.policy, options.name, yield* peerEntry(options.side, theirs));

  return yield* Console.log(
    `paired with ${options.name} in ${options.policy}. It may call nothing here until you list operations in peers.${options.name}.operations; run workhorse install to apply.`,
  );
});
