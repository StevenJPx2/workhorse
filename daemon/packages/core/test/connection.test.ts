import { ErrorCode } from "@workhorse/protocol/constants";
import type { Inbound } from "@workhorse/protocol";
import { describe, expect, it } from "vite-plus/test";
import { type Connection, type Directory, handle, newConnection } from "../src/index.ts";

const apps: Directory = {
  apps: new Map([["notes", new Set(["read"])]]),
  routes: new Map([
    ["mail", "home"],
    ["fs", "home"],
  ]),
};

const ready: Connection = { phase: "ready", version: 1 };

const hello = (protocol: [number, ...number[]]): Inbound => ({
  type: "hello",
  id: 1,
  params: { protocol },
});

const call = (method: string): Inbound => ({
  type: "call",
  id: 2,
  method,
  params: { path: "todo.md" },
});

describe("handle: greeting", () => {
  it("agrees on the highest version both sides speak", () => {
    expect(handle(apps, newConnection, hello([1, 7]))).toEqual({
      connection: ready,
      effects: [{ type: "reply", id: 1, result: { protocol: 1 } }],
    });
  });

  it("refuses a client with no supported version and stays in greeting", () => {
    expect(handle(apps, newConnection, hello([7]))).toEqual({
      connection: newConnection,
      effects: [
        {
          type: "refuse",
          id: 1,
          code: ErrorCode.invalidParams,
          message: "unsupported protocol version",
          data: { supported: [1] },
        },
      ],
    });
  });

  it("refuses calls before hello and a second hello", () => {
    expect(handle(apps, newConnection, call("notes.read")).effects).toMatchObject([
      { message: "hello first" },
    ]);
    expect(handle(apps, ready, hello([1])).effects).toMatchObject([
      { message: "hello already done" },
    ]);
  });
});

describe("handle: routing", () => {
  it("routes a declared operation to its app", () => {
    expect(handle(apps, ready, call("notes.read"))).toEqual({
      connection: ready,
      effects: [
        { type: "call_app", id: 2, app: "notes", operation: "read", params: { path: "todo.md" } },
      ],
    });
  });

  it("denies an outside client direct access to the outside world", () => {
    for (const method of ["fs.read", "net.fetch"]) {
      expect(handle(apps, ready, call(method)).effects).toEqual([
        {
          type: "refuse",
          id: 2,
          code: ErrorCode.denied,
          message: "denied",
          data: { capability: method, reason: "no_grant" },
        },
      ]);
    }
  });
});

describe("handle: routes to peers", () => {
  it("sends a routed app's operations to its peer, whatever the operation", () => {
    expect(handle(apps, ready, call("mail.anything")).effects).toEqual([
      {
        type: "call_peer",
        id: 2,
        peer: "home",
        method: "mail.anything",
        params: { path: "todo.md" },
      },
    ]);
  });

  it("never routes outside-world capabilities to a peer, even if the policy names them", () => {
    expect(handle(apps, ready, call("fs.read")).effects).toMatchObject([
      { code: ErrorCode.denied },
    ]);
  });

  it("reserves link.* for links: a local client cannot reach it", () => {
    for (const method of ["link.hello", "link.prove", "link.ping"]) {
      expect(handle(apps, ready, call(method)).effects).toMatchObject([
        { code: ErrorCode.methodNotFound },
      ]);
    }
  });
});

describe("handle: unknown and unreadable", () => {
  it("reports unknown apps, operations and malformed method names as not found", () => {
    for (const method of [
      "chat.read",
      "notes.write",
      "notes",
      ".read",
      "notes.",
      "constructor.read",
    ]) {
      expect(handle(apps, ready, call(method)).effects).toMatchObject([
        { code: ErrorCode.methodNotFound },
      ]);
    }
  });

  it("passes an unreadable line's error through in any phase", () => {
    const invalid: Inbound = {
      type: "invalid",
      id: null,
      code: ErrorCode.parseError,
      message: "invalid JSON",
    };

    for (const connection of [newConnection, ready]) {
      expect(handle(apps, connection, invalid)).toEqual({
        connection,
        effects: [
          { type: "refuse", id: null, code: ErrorCode.parseError, message: "invalid JSON" },
        ],
      });
    }
  });
});
