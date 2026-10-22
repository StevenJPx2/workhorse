import {
  CERTIFICATE_NAME,
  DIAL_DEADLINE_MS,
  LINK_KEY_HEADER,
  LINK_PATH,
  peerBinding,
} from "@workhorse/protocol";
import { Effect } from "effect";
import type { Env } from "../env.ts";
import { LinkError } from "./link-error.ts";

/**
 * Open a WebSocket to `peer` through its pinned TLS service. The deadline covers connecting,
 * TLS and the upgrade: a peer that accepts TCP but never finishes TLS stalls a dial (spike 6).
 */
export const dialPeer = Effect.fnUntraced(
  function* (env: Env, peer: string, ownKey: string): Effect.fn.Return<WebSocket, LinkError> {
    const service = env[peerBinding(peer)];

    if (service === undefined) return yield* new LinkError({ message: `no route to ${peer}` });

    const response = yield* Effect.tryPromise({
      try: () =>
        service.fetch(`https://${CERTIFICATE_NAME}${LINK_PATH}`, {
          headers: { Upgrade: "websocket", [LINK_KEY_HEADER]: ownKey },
        }),
      catch: (cause) => new LinkError({ message: `cannot reach ${peer}: ${String(cause)}` }),
    });

    const socket = response.webSocket;

    if (socket === null)
      return yield* new LinkError({ message: `${peer} refused the link (${response.status})` });

    socket.accept();

    return socket;
  },
  Effect.timeoutOrElse({
    duration: `${DIAL_DEADLINE_MS} millis`,
    orElse: () => Effect.fail(new LinkError({ message: "dial timed out" })),
  }),
);
