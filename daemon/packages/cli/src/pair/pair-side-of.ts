import { PeerAddress } from "@workhorse/protocol";
import { Effect, Option, Schema } from "effect";
import { InstallError } from "../inputs.ts";
import type { PairSide } from "./pair-side.ts";

const decodeAddress = Schema.decodeOption(PeerAddress);

/**
 * The side of a pairing from the command line: `--accept --listen <host:port>`, or the address
 * to dial as the first argument after `pair`. Both are checked as addresses.
 */
export function pairSideOf(
  accept: boolean,
  listen: string | undefined,
  address: string | undefined,
): Effect.Effect<PairSide, InstallError> {
  const given = accept ? listen : address;
  const what = accept ? "--listen <host:port>" : "an address to dial, <host:port>,";

  return Option.match(decodeAddress(given ?? ""), {
    onNone: () =>
      Effect.fail(new InstallError({ message: `pair needs ${what} not ${String(given)}` })),
    onSome: (checked): Effect.Effect<PairSide> =>
      Effect.succeed(
        accept ? { type: "accept", listen: checked } : { type: "dial", address: checked },
      ),
  });
}
