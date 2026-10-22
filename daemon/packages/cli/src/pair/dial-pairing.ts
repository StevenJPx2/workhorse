import { connect, type Socket } from "node:net";
import { Effect } from "effect";
import { InstallError } from "../inputs.ts";
import { exchange } from "./exchange.ts";
import { hostPort } from "./host-port.ts";
import type { PairOffer } from "./pair-offer.ts";

/** Connect to a machine waiting in `workhorse pair --accept` and swap offers with it. */
export function dialPairing(
  address: string,
  own: PairOffer,
): Effect.Effect<PairOffer, InstallError> {
  const { host, port } = hostPort(address);

  const connection = Effect.callback<Socket, InstallError>((resume) => {
    const socket = connect({ host, port });

    socket.once("connect", () => resume(Effect.succeed(socket)));
    socket.once("error", (error) =>
      resume(
        Effect.fail(new InstallError({ message: `cannot reach ${address}: ${error.message}` })),
      ),
    );

    return Effect.sync(() => socket.destroy());
  });

  return connection.pipe(
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () => Effect.fail(new InstallError({ message: `cannot reach ${address} in 10 s` })),
    }),
    Effect.flatMap((socket) => exchange(socket, own)),
  );
}
