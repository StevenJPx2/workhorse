import type { Socket } from "node:net";
import { Effect, Option, Schema } from "effect";
import { InstallError } from "../inputs.ts";
import { PairOffer } from "./pair-offer.ts";

/** An offer is one JSON line; anything longer is refused. A certificate is under 1 KB. */
const MAX_OFFER_BYTES = 16_384;

const decodeOffer = Schema.decodeUnknownOption(Schema.fromJsonString(PairOffer));

/**
 * Send this side's offer as one line and read the other side's, within 10 s. The socket is
 * closed either way. The other side is untrusted: its offer is decoded before use.
 */
export function exchange(socket: Socket, own: PairOffer): Effect.Effect<PairOffer, InstallError> {
  const swapped = Effect.callback<PairOffer, InstallError>((resume) => {
    let received = "";
    let settled = false;

    // Only the first outcome counts; the socket's close after a good offer is not a failure.
    const settle = (outcome: Effect.Effect<PairOffer, InstallError>) => {
      if (!settled) resume(outcome);
      settled = true;
    };

    const fail = (message: string) => settle(Effect.fail(new InstallError({ message })));

    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString("utf8");
      const end = received.indexOf("\n");

      if (received.length > MAX_OFFER_BYTES) fail("the other side sent too much");
      else if (end !== -1)
        Option.match(decodeOffer(received.slice(0, end)), {
          onNone: () => fail("the other side's offer is not valid"),
          onSome: (offer) => settle(Effect.succeed(offer)),
        });
    });
    socket.on("error", (error) => fail(`pairing connection failed: ${error.message}`));
    socket.on("close", () => fail("the other side closed the connection"));
    socket.write(`${JSON.stringify(own)}\n`);

    return Effect.sync(() => socket.destroy());
  });

  return swapped.pipe(
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () =>
        Effect.fail(new InstallError({ message: "no offer from the other side in 10 s" })),
    }),
    Effect.ensuring(Effect.sync(() => socket.end())),
  );
}
