import { DurableObject } from "cloudflare:workers";
import { acceptLink, dialLink, type LinkStep } from "@workhorse/core";
import type { Json, Outcome } from "@workhorse/protocol";
import { Deferred, Effect, type Fiber, Option } from "effect";
import { appsHere } from "../apps-here.ts";
import { deploymentOf, type Env } from "../env.ts";
import { unavailable } from "../outcome.ts";
import { dialPeer } from "./dial-peer.ts";
import { freshNonce } from "./fresh-nonce.ts";
import { LinkError } from "./link-error.ts";
import { linkPeerOf, type PairedPeer } from "./link-peer-of.ts";
import { ownIdentity } from "./own-identity.ts";
import { PEER_HEADER } from "./peer-header.ts";
import { redialDelay } from "./redial-delay.ts";
import { Session } from "./session.ts";

/**
 * The one link to one peer, named by the peer. Its namespace sets `preventEviction`, so it holds
 * the link for good (spike 6). It accepts the peer's upgrades, or, when the policy gives the
 * peer an address, dials and redials it. A newer session replaces an older one.
 */
export class Link extends DurableObject<Env> {
  #session: Session | undefined;
  #dialer: Fiber.Fiber<unknown> | undefined;

  /** Keep a link open to `peer` if the policy gives its address. Calling it again does nothing. */
  start(peer: string): void {
    if (this.#dialer !== undefined) return;
    this.#dialer = Effect.runFork(this.#redial(peer));
  }

  /** Call a public operation on `peer`: `unavailable` at once when no link is open. */
  call(method: string, params: Json | undefined): Promise<Outcome> {
    const session = this.#session;

    return Effect.runPromise(
      session?.ready === true ? session.call(method, params) : Effect.succeed(unavailable),
    );
  }

  /** An upgrade the daemon's fetch handler forwarded, already matched to a paired peer's key. */
  override fetch(request: Request): Promise<Response> {
    const accepted = Effect.gen({ self: this }, function* () {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      server.accept();
      yield* this.#open(request.headers.get(PEER_HEADER) ?? "", server, (_, own) => ({
        state: acceptLink(own),
        effects: [],
      }));

      return new Response(null, { status: 101, webSocket: client });
    });

    return Effect.runPromise(
      accepted.pipe(
        Effect.tapError((error) => Effect.logWarning(`link refused: ${error.message}`)),
        Effect.orElseSucceed(() => new Response("link refused", { status: 403 })),
      ),
    );
  }

  // Keep a link to `peer` for as long as this object lives: after a link that opened, redial at
  // once; after failures, back off (redialDelay).
  #redial(peer: string): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      for (let attempt = 0; ; attempt += 1) {
        if (yield* this.#linkOnce(peer)) attempt = 0;
        yield* Effect.sleep(`${redialDelay(attempt)} millis`);
      }
    });
  }

  // Dial once and hold the link until it ends; whether it ever opened.
  #linkOnce(peer: string): Effect.Effect<boolean> {
    return this.#dial(peer).pipe(
      Effect.flatMap((session) => Deferred.await(session.ended)),
      Effect.map((end) => end.opened),
      Effect.tapError((error) => Effect.logWarning(`link to ${peer}: ${error.message}`)),
      Effect.orElseSucceed(() => false),
    );
  }

  #dial(peer: string): Effect.Effect<Session, LinkError> {
    return Effect.gen({ self: this }, function* () {
      const identity = yield* ownIdentity(this.env);
      const socket = yield* dialPeer(this.env, peer, identity.key);

      return yield* this.#open(peer, socket, (paired, own) => dialLink(paired, own));
    });
  }

  // Start a session for `peer` on `socket` and make it the current one.
  #open(
    peer: string,
    socket: WebSocket,
    start: (paired: PairedPeer, own: { readonly key: string; readonly nonce: string }) => LinkStep,
  ): Effect.Effect<Session, LinkError> {
    return Effect.gen({ self: this }, function* () {
      const deployment = deploymentOf(this.env);

      if (Option.isNone(deployment)) return yield* new LinkError({ message: "invalid deployment" });
      const paired = linkPeerOf(deployment.value.policy, peer);

      if (paired === undefined) return yield* new LinkError({ message: `${peer} is not paired` });
      const identity = yield* ownIdentity(this.env);
      const own = { key: identity.key, nonce: yield* freshNonce };
      const here = appsHere(deployment.value);

      const session = yield* Session.open(socket, start(paired, own), {
        env: this.env,
        ctx: this.ctx,
        context: { apps: here.apps, peers: new Map([[paired.key, paired]]) },
        specs: here.specs,
        privateKey: identity.privateKey,
      });

      yield* this.#replace(session);

      return session;
    });
  }

  #replace(session: Session): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      const previous = this.#session;

      this.#session = session;

      if (previous !== undefined) yield* previous.end("replaced by a newer link");
    });
  }
}
