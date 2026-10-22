import { createServer, type Socket } from "node:net";
import { Effect } from "effect";
import { InstallError } from "../inputs.ts";
import { exchange } from "./exchange.ts";
import { hostPort } from "./host-port.ts";
import type { PairOffer } from "./pair-offer.ts";

/** How long `workhorse pair --accept` waits for the other machine. */
const ACCEPT_WINDOW = "5 minutes";

/**
 * Wait on `listen` for one pairing connection and swap offers with it. The listener closes after
 * the first connection or the window, so it never stays open.
 */
export function acceptPairing(
  listen: string,
  own: PairOffer,
): Effect.Effect<PairOffer, InstallError> {
  const { host, port } = hostPort(listen);

  const connection = Effect.callback<Socket, InstallError>((resume) => {
    const server = createServer((socket) => {
      server.close();
      resume(Effect.succeed(socket));
    });

    server.on("error", (error) =>
      resume(
        Effect.fail(new InstallError({ message: `cannot listen on ${listen}: ${error.message}` })),
      ),
    );
    server.listen(port, host);

    return Effect.sync(() => server.close());
  });

  return connection.pipe(
    Effect.timeoutOrElse({
      duration: ACCEPT_WINDOW,
      orElse: () =>
        Effect.fail(new InstallError({ message: `nobody paired on ${listen} within 5 minutes` })),
    }),
    Effect.flatMap((socket) => exchange(socket, own)),
  );
}
