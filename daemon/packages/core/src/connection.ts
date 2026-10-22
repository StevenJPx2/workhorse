import { ErrorCode, SUPPORTED_VERSIONS } from "@workhorse/protocol/constants";
import type { Inbound, Json, RequestId } from "@workhorse/protocol";

// One client connection. A client must agree on a version before anything else.
export type Connection =
  | { readonly phase: "greeting" }
  | { readonly phase: "ready"; readonly version: number };

export const newConnection: Connection = { phase: "greeting" };

// The apps the daemon loaded, each with the public operations its manifest declares.
export type Apps = ReadonlyMap<string, ReadonlySet<string>>;

export type Action =
  | { readonly type: "reply"; readonly id: RequestId; readonly result: Json }
  | {
      readonly type: "refuse";
      readonly id: RequestId | null;
      readonly code: ErrorCode;
      readonly message: string;
      readonly data?: Json;
    }
  | {
      readonly type: "call_app";
      readonly id: RequestId;
      readonly app: string;
      readonly operation: string;
      readonly params: Json | undefined;
    };

export type Step = { readonly connection: Connection; readonly effects: readonly Action[] };

// Base capabilities that reach the outside world. An outside client holds no grant for them.
const OUTSIDE_WORLD: ReadonlySet<string> = new Set(["fs", "net"]);

export function handle(apps: Apps, connection: Connection, inbound: Inbound): Step {
  const stay = (action: Action): Step => ({ connection, effects: [action] });

  if (inbound.type === "invalid") {
    return stay({ type: "refuse", id: inbound.id, code: inbound.code, message: inbound.message });
  }

  if (inbound.type === "hello") {
    if (connection.phase === "ready")
      return stay(refuse(inbound.id, ErrorCode.invalidRequest, "hello already done"));

    return greet(inbound.id, inbound.params.protocol);
  }

  if (connection.phase === "greeting")
    return stay(refuse(inbound.id, ErrorCode.invalidRequest, "hello first"));

  return stay(route(apps, inbound.id, inbound.method, inbound.params));
}

function greet(id: RequestId, offered: readonly number[]): Step {
  const agreed = Math.max(...offered.filter((version) => SUPPORTED_VERSIONS.includes(version)));

  if (agreed === -Infinity) {
    return {
      connection: newConnection,
      effects: [
        {
          type: "refuse",
          id,
          code: ErrorCode.invalidParams,
          message: "unsupported protocol version",
          data: { supported: [...SUPPORTED_VERSIONS] },
        },
      ],
    };
  }

  return {
    connection: { phase: "ready", version: agreed },
    effects: [{ type: "reply", id, result: { protocol: agreed } }],
  };
}

function route(apps: Apps, id: RequestId, method: string, params: Json | undefined): Action {
  const dot = method.indexOf(".");
  const owner = method.slice(0, dot);
  const operation = method.slice(dot + 1);

  if (dot <= 0 || operation === "")
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  if (OUTSIDE_WORLD.has(owner)) return deny(id, method, "no_grant");

  if (apps.get(owner)?.has(operation) !== true)
    return refuse(id, ErrorCode.methodNotFound, `no method ${method}`);

  return { type: "call_app", id, app: owner, operation, params };
}

function refuse(id: RequestId, code: ErrorCode, message: string): Action {
  return { type: "refuse", id, code, message };
}

export function deny(id: RequestId, capability: string, reason: DenyReason): Action {
  return {
    type: "refuse",
    id,
    code: ErrorCode.denied,
    message: "denied",
    data: { capability, reason },
  };
}

export type DenyReason = "no_grant" | "outside_root";
