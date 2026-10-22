import { type Deployment, LINK_KEY_HEADER, LINK_PATH } from "@workhorse/protocol";
import { Effect, Option } from "effect";
import { PEER_HEADER } from "./peer-header.ts";
import { peerNameByKey } from "./peer-name-by-key.ts";

/** Hands an upgrade to the named peer's Link object. */
export type ForwardToLink = (peer: string, request: Request) => Promise<Response>;

/**
 * The daemon's HTTPS handler: a link upgrade from a paired key goes to that peer's Link object;
 * everything else is refused. The key only routes; the handshake proves it.
 */
export function acceptUpgrade(
  request: Request,
  deployment: Option.Option<Deployment>,
  forward: ForwardToLink,
): Effect.Effect<Response> {
  return Effect.gen(function* () {
    const url = new URL(request.url);

    if (url.pathname !== LINK_PATH || request.headers.get("Upgrade") !== "websocket")
      return new Response("not found", { status: 404 });
    const key = request.headers.get(LINK_KEY_HEADER) ?? "";
    const peer = Option.getOrUndefined(Option.map(deployment, (d) => peerNameByKey(d.policy, key)));

    if (peer === undefined) return new Response("not paired", { status: 403 });
    const headers = new Headers(request.headers);

    headers.set(PEER_HEADER, peer);

    return yield* Effect.tryPromise(() => forward(peer, new Request(request, { headers }))).pipe(
      Effect.orElseSucceed(() => new Response("link failed", { status: 502 })),
    );
  });
}
