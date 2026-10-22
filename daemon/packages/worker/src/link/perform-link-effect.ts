import type { LinkEffect, LinkEvent, LocalAction } from "@workhorse/core";
import {
  HELLO_ID,
  type Message,
  type Outcome,
  PROVE_ID,
  type RequestId,
} from "@workhorse/protocol";
import { type Cause, Effect } from "effect";
import { responseOf } from "../response-of.ts";
import type { SessionDeps } from "./session-deps.ts";
import { signTranscript } from "./sign-transcript.ts";
import { verifyTranscript } from "./verify-transcript.ts";

/** The parts of a session that its effects use. */
export type SessionPort = {
  readonly deps: SessionDeps;
  readonly send: (message: Message) => Effect.Effect<void, Cause.UnknownError>;
  readonly settle: (id: RequestId | null, outcome: Outcome) => void;
  readonly callApp: (action: LocalAction & { readonly type: "call_app" }) => void;
  readonly end: (reason: string) => Effect.Effect<void>;
};

type EffectOf<K extends LinkEffect["type"]> = Extract<LinkEffect, { readonly type: K }>;

type Performed = Effect.Effect<LinkEvent | undefined, Cause.UnknownError>;

// One handler per kind of effect: a new kind fails to compile until it has one.
type Handlers = {
  readonly [K in LinkEffect["type"]]: (port: SessionPort, effect: EffectOf<K>) => Performed;
};

const done = <E>(work: Effect.Effect<unknown, E>) => Effect.as(work, undefined);

const HANDLERS: Handlers = {
  reply: (port, effect) => done(port.send(responseOf(effect))),
  refuse: (port, effect) => done(port.send(responseOf(effect))),
  call_app: (port, effect) => done(Effect.sync(() => port.callApp(effect))),
  send_hello: (port, effect) =>
    done(port.send({ jsonrpc: "2.0", id: HELLO_ID, method: "link.hello", params: effect.params })),
  reply_hello: (port, effect) =>
    signTranscript(port.deps.privateKey, effect.sign).pipe(
      Effect.flatMap((signature) =>
        port.send({ jsonrpc: "2.0", id: effect.id, result: { ...effect.result, signature } }),
      ),
      done,
    ),
  send_prove: (port, effect) =>
    signTranscript(port.deps.privateKey, effect.sign).pipe(
      Effect.flatMap((signature) =>
        port.send({ jsonrpc: "2.0", id: PROVE_ID, method: "link.prove", params: { signature } }),
      ),
      done,
    ),
  verify: (_, effect) =>
    Effect.map(
      verifyTranscript(effect.key, effect.signature, effect.transcript),
      (valid): LinkEvent => ({ type: "verified", valid }),
    ),
  settle: (port, effect) => done(Effect.sync(() => port.settle(effect.id, effect.outcome))),
  open: (_, effect) => done(Effect.logInfo(`link open: ${effect.peer}`)),
  close: (port, effect) => done(port.end(effect.reason)),
};

/**
 * Perform one effect of the link rules. A verification returns its answer as the next event;
 * a failure to sign or send ends the session rather than leaving the handshake half done.
 */
export function performLinkEffect<K extends LinkEffect["type"]>(
  port: SessionPort,
  effect: EffectOf<K> & { readonly type: K },
): Effect.Effect<LinkEvent | undefined> {
  const handler: Handlers[K] = HANDLERS[effect.type];

  return handler(port, effect).pipe(
    Effect.catch(() => Effect.as(port.end("cannot sign or send"), undefined)),
  );
}
