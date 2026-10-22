import { connect } from "node:net";
import { encodeLine, PROTOCOL_VERSION } from "@workhorse/protocol";
import { Effect, Schedule } from "effect";
import { InstallError } from "./inputs.ts";

// workerd creates the daemon's isolate and loads its code on the first connection, which costs
// tens of milliseconds (mostly Effect). One `hello` right after start pays that before a client.

const hello = encodeLine({
  jsonrpc: "2.0",
  id: 1,
  method: "hello",
  params: { protocol: [PROTOCOL_VERSION] },
});

function helloOnce(socket: string): Effect.Effect<void, InstallError> {
  return Effect.callback<void, InstallError>((resume) => {
    const connection = connect({ path: socket });

    const fail = (reason: string) => {
      connection.destroy();
      resume(
        Effect.fail(
          new InstallError({ message: `cannot warm the daemon at ${socket}: ${reason}` }),
        ),
      );
    };

    connection.on("connect", () => connection.write(hello));
    connection.on("data", () => {
      connection.destroy();
      resume(Effect.void);
    });
    connection.on("error", (error) => fail(error.message));
    connection.on("close", () => fail("closed without a reply"));

    return Effect.sync(() => connection.destroy());
  });
}

// Retries for up to about 10 s, in case the daemon is still starting.
export function warm(socket: string): Effect.Effect<void, InstallError> {
  return helloOnce(socket).pipe(
    Effect.retry({ times: 200, schedule: Schedule.spaced("50 millis") }),
  );
}
