import { type Peer, PeerAddress } from "@workhorse/protocol";
import { Effect, Schema } from "effect";
import { InstallError } from "../inputs.ts";
import type { PairOffer } from "./pair-offer.ts";
import type { PairSide } from "./pair-side.ts";

const decodeAddress = Schema.decodeEffect(PeerAddress);

/**
 * The policy entry for the other side: its pinned key and certificate, and no operations. The
 * dialing side also records where to dial: the host it paired with, on the port the other side
 * reported.
 */
export function peerEntry(side: PairSide, theirs: PairOffer): Effect.Effect<Peer, InstallError> {
  const pinned = { key: theirs.key, certificate: theirs.certificate, operations: [] };

  if (side.type === "accept") return Effect.succeed(pinned);

  if (theirs.linkPort === undefined)
    return Effect.fail(new InstallError({ message: "the other side accepts no links" }));
  const host = side.address.slice(0, side.address.lastIndexOf(":"));

  return decodeAddress(`${host}:${theirs.linkPort}`).pipe(
    Effect.mapError(() => new InstallError({ message: `invalid link port ${theirs.linkPort}` })),
    Effect.map((address) => ({
      key: theirs.key,
      certificate: theirs.certificate,
      address,
      operations: [],
    })),
  );
}
