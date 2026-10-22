import { type Action, type Apps, type Connection, handle, newConnection } from "@workhorse/core";
import {
  type AppSpec,
  type Deployment,
  encodeLine,
  ErrorCode,
  type Frame,
  LineReader,
  MAX_LINE_BYTES,
  readRequest,
  type Response,
} from "@workhorse/protocol";
import { type Cause, Effect, Option } from "effect";
import { callApp, type Context } from "./apps.ts";
import { deploymentOf, type Env } from "./env.ts";
import { toResponse } from "./outcome.ts";

// Connections beyond this are refused with `limited` and closed.
export const MAX_CONNECTIONS = 64;

let open = 0;

// What `serve` uses of workerd's Socket.
export type ByteSocket = Pick<Socket, "readable" | "writable" | "close">;

type Routes = { readonly apps: Apps; readonly specs: ReadonlyMap<string, AppSpec> };

export type Admission =
  | { readonly type: "refused"; readonly response: Response }
  | { readonly type: "admitted"; readonly routes: Routes };

// Whether a new connection may proceed, given the deployment and how many are open.
export function admit(deployment: Option.Option<Deployment>, openConnections: number): Admission {
  if (Option.isNone(deployment))
    return { type: "refused", response: refusal(ErrorCode.failed, "invalid deployment") };

  if (openConnections >= MAX_CONNECTIONS) {
    return { type: "refused", response: refusal(ErrorCode.limited, "too many connections") };
  }

  const apps = deployment.value.apps;

  return {
    type: "admitted",
    routes: {
      apps: new Map(apps.map((app) => [app.name, new Set(app.operations)])),
      specs: new Map(apps.map((app) => [app.name, app])),
    },
  };
}

// One client connection: read lines, let core decide, perform its actions, reply in order.
export const serve = Effect.fnUntraced(
  function* (socket: ByteSocket, env: Env, ctx: Context) {
    const writer = socket.writable.getWriter();
    const encoder = new TextEncoder();

    const send = (response: Response) =>
      Effect.tryPromise(() => writer.write(encoder.encode(encodeLine(response))));

    const admission = admit(deploymentOf(env), open);

    if (admission.type === "refused") {
      yield* send(admission.response);

      return;
    }

    open += 1;
    yield* Effect.addFinalizer(() => Effect.sync(() => (open -= 1)));
    const session: Session = { env, ctx, routes: admission.routes, send };
    const lines = new LineReader(MAX_LINE_BYTES);
    const reader = socket.readable.getReader();
    let connection = newConnection;

    for (let chunk = yield* read(reader); chunk !== undefined; chunk = yield* read(reader)) {
      const pushed = lines.push(chunk);

      for (const frame of pushed.frames) connection = yield* answer(session, connection, frame);

      if (pushed.overflow) {
        yield* send(refusal(ErrorCode.invalidRequest, `line over ${MAX_LINE_BYTES} bytes`));

        return;
      }
    }
  },
  Effect.scoped,
  // A broken connection ends quietly; the socket is closed below either way.
  (effect) => Effect.ignore(effect),
  (effect, socket) =>
    Effect.ensuring(
      effect,
      Effect.promise(() => socket.close().catch(() => undefined)),
    ),
);

type Session = {
  readonly env: Env;
  readonly ctx: Context;
  readonly routes: Routes;
  readonly send: (response: Response) => Effect.Effect<void, Cause.UnknownError>;
};

// The next chunk of bytes, or undefined once the client has finished sending.
function read(
  reader: ReadableStreamDefaultReader,
): Effect.Effect<Uint8Array | undefined, Cause.UnknownError> {
  return Effect.map(
    Effect.tryPromise(() => reader.read()),
    (chunk) => (!chunk.done && chunk.value instanceof Uint8Array ? chunk.value : undefined),
  );
}

const answer = Effect.fnUntraced(function* (
  session: Session,
  connection: Connection,
  frame: Frame,
): Effect.fn.Return<Connection, Cause.UnknownError> {
  const step = handle(session.routes.apps, connection, readRequest(frame));

  for (const action of step.effects) {
    yield* session.send(
      action.type === "call_app" ? yield* callAction(session, action) : responseOf(action),
    );
  }

  return step.connection;
});

// The reply for an action core already answered.
export function responseOf(action: Exclude<Action, { readonly type: "call_app" }>): Response {
  if (action.type === "reply") return { jsonrpc: "2.0", id: action.id, result: action.result };
  const error = { code: action.code, message: action.message };

  return {
    jsonrpc: "2.0",
    id: action.id,
    error: action.data === undefined ? error : { ...error, data: action.data },
  };
}

const callAction = Effect.fnUntraced(function* (
  session: Session,
  action: Extract<Action, { readonly type: "call_app" }>,
): Effect.fn.Return<Response> {
  const app = session.routes.specs.get(action.app);

  if (app === undefined)
    return toResponse(action.id, { error: { code: ErrorCode.methodNotFound, message: "no app" } });

  return toResponse(
    action.id,
    yield* callApp(session.env, session.ctx, app, action.operation, action.params),
  );
});

function refusal(code: ErrorCode, message: string): Response {
  return { jsonrpc: "2.0", id: null, error: { code, message } };
}
