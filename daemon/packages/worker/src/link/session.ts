import {
  type LinkEvent,
  type LinkState,
  type LinkStep,
  linkStep,
  type LocalAction,
} from "@workhorse/core";
import {
  CALL_DEADLINE_MS,
  DIAL_DEADLINE_MS,
  ErrorCode,
  HEARTBEAT_MS,
  type Json,
  MAX_LINE_BYTES,
  type Message,
  type Outcome,
  readLinkMessage,
  type Request,
  type RequestId,
  SILENCE_LIMIT_MS,
} from "@workhorse/protocol";
import { type Cause, Clock, Deferred, Effect, Fiber, Queue, Schedule } from "effect";
import { callApp } from "../apps.ts";
import { failed, toResponse, unavailable } from "../outcome.ts";
import { responseOf } from "../response-of.ts";
import { performLinkEffect, type SessionPort } from "./perform-link-effect.ts";
import type { SessionDeps } from "./session-deps.ts";

/** Messages waiting for the session's one consumer; a peer that floods past this is dropped. */
const MAX_QUEUED = 256;

/** This side's calls waiting for the peer's answer. */
const MAX_PENDING = 64;

/** The peer's calls running in apps here at once; more are refused with `limited`. */
const MAX_APP_CALLS = 16;

const CALL_TIMEOUT = `${CALL_DEADLINE_MS} millis` as const;
const HEARTBEAT_DELAY = `${HEARTBEAT_MS} millis` as const;
const HANDSHAKE_DEADLINE = `${DIAL_DEADLINE_MS} millis` as const;

/** Why a session ended, and whether its handshake ever finished: a dialer backs off only after one that did not. */
type SessionEnd = { readonly reason: string; readonly opened: boolean };

// What the socket adapter enqueues: a link event, or a reason the session must end.
type SessionEvent = LinkEvent | { readonly type: "ended"; readonly reason: string };

/**
 * One open WebSocket to a peer. Socket callbacks only enqueue; a single fiber applies the link
 * rules to each event in order and performs their effects. A heartbeat fiber pings the peer and
 * ends the session after SILENCE_LIMIT_MS without hearing from it.
 */
export class Session {
  /** Completes once, when the session ends: why, and whether its handshake ever finished. */
  readonly ended = Deferred.makeUnsafe<SessionEnd>();
  readonly #queue = Effect.runSync(Queue.bounded<SessionEvent>(MAX_QUEUED));
  readonly #pending = new Map<RequestId, Deferred.Deferred<Outcome>>();
  readonly #fibers: Fiber.Fiber<unknown>[] = [];
  readonly #appCalls = new Set<Fiber.Fiber<unknown>>();
  #state: LinkState;
  #lastHeard = 0;
  #nextId = 1;
  #opened = false;

  private constructor(
    readonly socket: WebSocket,
    state: LinkState,
    readonly deps: SessionDeps,
  ) {
    this.#state = state;
  }

  /** Start a session on an accepted socket; `start` is the link rules' first step. */
  static open(socket: WebSocket, start: LinkStep, deps: SessionDeps): Effect.Effect<Session> {
    const session = new Session(socket, start.state, deps);

    return Effect.gen({ self: session }, function* () {
      this.#lastHeard = yield* Clock.currentTimeMillis;
      this.#listen();
      // Detached from whoever opened the session; `end` interrupts them.
      this.#fibers.push(
        yield* Effect.forkDetach(this.#consume()),
        yield* Effect.forkDetach(this.#heartbeat()),
        yield* Effect.forkDetach(this.#handshakeDeadline()),
      );

      for (const effect of start.effects) yield* performLinkEffect(this.#port(), effect);

      return this;
    });
  }

  get ready(): boolean {
    return this.#state.phase === "ready";
  }

  /** Call a public operation on the peer: `unavailable` unless the link is open and it answers in time. */
  call(method: string, params: Json | undefined): Effect.Effect<Outcome> {
    if (!this.ready) return Effect.succeed(unavailable);

    if (this.#pending.size >= MAX_PENDING) return Effect.succeed(failed("too_many_calls"));
    const id = this.#nextId;
    const answer = Deferred.makeUnsafe<Outcome>();

    const request: Request =
      params === undefined
        ? { jsonrpc: "2.0", id, method }
        : { jsonrpc: "2.0", id, method, params };

    this.#nextId += 1;
    this.#pending.set(id, answer);

    return this.#send(request).pipe(
      Effect.andThen(Deferred.await(answer)),
      Effect.timeoutOrElse({ duration: CALL_TIMEOUT, orElse: () => Effect.succeed(unavailable) }),
      Effect.orElseSucceed(() => unavailable),
      Effect.ensuring(Effect.sync(() => this.#pending.delete(id))),
    );
  }

  /** End the session once: close the socket, stop its fibers, and answer waiting calls `unavailable`. */
  end(reason: string): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      if (Deferred.doneUnsafe(this.ended, Effect.succeed({ reason, opened: this.#opened }))) {
        yield* Effect.logInfo(`link ended: ${reason}`);
        this.#state = { phase: "closed" };

        for (const answer of this.#pending.values())
          Deferred.doneUnsafe(answer, Effect.succeed(unavailable));
        this.#pending.clear();
        yield* Queue.shutdown(this.#queue);
        yield* Effect.sync(() => this.socket.close(1000, reason.slice(0, 120)));
        yield* Effect.forEach([...this.#fibers, ...this.#appCalls], Fiber.interrupt, {
          discard: true,
        });
      }
    }).pipe(Effect.ignore);
  }

  // The socket adapter: callbacks only enqueue, in arrival order.
  #listen(): void {
    const enqueue = (event: SessionEvent) => {
      if (!Queue.offerUnsafe(this.#queue, event))
        Effect.runFork(this.end("too many queued messages"));
    };

    this.socket.addEventListener("message", (event) => {
      const text = event.data instanceof ArrayBuffer ? undefined : event.data;

      enqueue(
        text === undefined || text.length > MAX_LINE_BYTES
          ? { type: "ended", reason: "message not text or too large" }
          : { type: "message", message: readLinkMessage(text) },
      );
    });
    this.socket.addEventListener("close", () =>
      enqueue({ type: "ended", reason: "closed by the peer" }),
    );
    this.socket.addEventListener("error", () => enqueue({ type: "ended", reason: "socket error" }));
  }

  #consume(): Effect.Effect<void> {
    const take = Effect.gen({ self: this }, function* () {
      const event = yield* Queue.take(this.#queue);

      if (event.type === "ended") {
        yield* this.end(event.reason);
      } else {
        this.#lastHeard = yield* Clock.currentTimeMillis;
        yield* this.#apply(event);
      }
    });

    return Effect.forever(take).pipe(Effect.ignore);
  }

  // Apply one event; a verification's answer is applied straight after, before the next message.
  #apply(event: LinkEvent): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      for (let next: LinkEvent | undefined = event; next !== undefined;)
        next = yield* this.#step(next);
    });
  }

  // One step of the link rules and its effects, in order; returns a verification's answer, if any.
  #step(event: LinkEvent): Effect.Effect<LinkEvent | undefined> {
    return Effect.gen({ self: this }, function* () {
      const step = linkStep(this.deps.context, this.#state, event);
      let followUp: LinkEvent | undefined;

      this.#state = step.state;
      this.#opened ||= step.state.phase === "ready";

      for (const effect of step.effects)
        followUp = (yield* performLinkEffect(this.#port(), effect)) ?? followUp;

      return followUp;
    });
  }

  // Pings start only once the link is open: before that, the handshake's own messages must come first.
  #heartbeat(): Effect.Effect<void> {
    const beat = Effect.gen({ self: this }, function* () {
      const now = yield* Clock.currentTimeMillis;

      if (now - this.#lastHeard > SILENCE_LIMIT_MS) {
        yield* this.end("peer went silent");
      } else if (this.ready) {
        yield* this.#send({ jsonrpc: "2.0", method: "link.ping" }).pipe(Effect.ignore);
      }
    });

    return Effect.sleep(HEARTBEAT_DELAY).pipe(
      Effect.andThen(Effect.repeat(beat, Schedule.spaced(HEARTBEAT_DELAY))),
      Effect.asVoid,
    );
  }

  #handshakeDeadline(): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      yield* Effect.sleep(HANDSHAKE_DEADLINE);

      if (!this.ready) yield* this.end("handshake did not finish in time");
    });
  }

  // Run a peer's call in its app without blocking the link; the answer is sent when it is ready.
  #callApp(action: LocalAction & { readonly type: "call_app" }): void {
    const { env, ctx, specs } = this.deps;
    const spec = specs.get(action.app);

    if (spec === undefined || this.#appCalls.size >= MAX_APP_CALLS) {
      const refusal =
        spec === undefined
          ? { code: ErrorCode.methodNotFound, message: "no app" }
          : { code: ErrorCode.limited, message: "too many calls" };

      Effect.runFork(
        this.#send(responseOf({ type: "refuse", id: action.id, ...refusal })).pipe(Effect.ignore),
      );
    } else {
      const call: Effect.Effect<void> = callApp(
        env,
        ctx,
        spec,
        action.operation,
        action.params,
      ).pipe(
        Effect.flatMap((outcome) => this.#send(toResponse(action.id, outcome))),
        Effect.ignore,
      );

      const fiber: Fiber.Fiber<void> = Effect.runFork(call);

      this.#appCalls.add(fiber);
      fiber.addObserver(() => this.#appCalls.delete(fiber));
    }
  }

  #send(message: Message): Effect.Effect<void, Cause.UnknownError> {
    return Effect.try(() => this.socket.send(JSON.stringify(message)));
  }

  #port(): SessionPort {
    return {
      deps: this.deps,
      send: (message) => this.#send(message),
      callApp: (action) => this.#callApp(action),
      settle: (id, outcome) => {
        const answer = id === null ? undefined : this.#pending.get(id);

        if (answer !== undefined) Deferred.doneUnsafe(answer, Effect.succeed(outcome));
      },
      end: (reason) => this.end(reason),
    };
  }
}
