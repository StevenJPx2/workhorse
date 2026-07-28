// The binder is what makes the function-per-file layout viable: it applies the
// connection once and DERIVES the resulting type, so no hand-written interface
// can drift from the functions.
//
// These tests cover the runtime half. The type half is asserted inline with
// expect-error directives, which fail the TYPECHECK (not this suite) if the
// derivation ever stops narrowing.

import { describe, expect, it } from "vitest";
import { bind, type Conn } from "../bind";

/** Stand-in connection — the binder never inspects it, only forwards it. */
const conn = { marker: "conn" } as unknown as Conn;

const fns = {
  async one(d: Conn, id: string): Promise<string> {
    return `${(d as unknown as { marker: string }).marker}:${id}`;
  },
  async two(d: Conn, a: number, b = 10): Promise<number> {
    void d;
    return a + b;
  },
  sync(d: Conn): string {
    return (d as unknown as { marker: string }).marker;
  },
};

describe("bind", () => {
  it("applies the connection so callers never pass it", async () => {
    const repo = bind(conn, fns);
    expect(await repo.one("x")).toBe("conn:x");
  });

  it("forwards the SAME connection instance, not a copy", () => {
    const repo = bind(conn, fns);
    expect(repo.sync()).toBe("conn");
  });

  it("preserves default parameters", async () => {
    const repo = bind(conn, fns);

    // A binder that spread a fixed-length args array would pass undefined here
    // and defeat the default.
    expect(await repo.two(5)).toBe(15);
    expect(await repo.two(5, 1)).toBe(6);
  });

  it("exposes every function in the namespace and nothing else", () => {
    const repo = bind(conn, fns);
    expect(Object.keys(repo).sort()).toEqual(["one", "sync", "two"]);
  });

  it("binds each function independently", async () => {
    const repo = bind(conn, fns);
    const [a, b] = await Promise.all([repo.one("a"), repo.one("b")]);

    expect([a, b]).toEqual(["conn:a", "conn:b"]);
  });

  it("gives each bound repo its own connection", async () => {
    const other = { marker: "other" } as unknown as Conn;

    // Two Db instances in one isolate must not share a connection — that is the
    // per-request isolation the WeakMap seam depends on.
    expect(await bind(conn, fns).one("x")).toBe("conn:x");
    expect(await bind(other, fns).one("x")).toBe("other:x");
  });

  it("propagates a rejection rather than swallowing it", async () => {
    const boom = {
      async fail(_d: Conn): Promise<never> {
        throw new Error("query failed");
      },
    };

    await expect(bind(conn, boom).fail()).rejects.toThrow("query failed");
  });

  it("handles an empty namespace", () => {
    expect(Object.keys(bind(conn, {}))).toEqual([]);
  });

  it("keeps return types narrow", async () => {
    const repo = bind(conn, fns);

    // The annotations are the assertion: if the derivation stopped narrowing,
    // these lines would fail the TYPECHECK, not this expect.
    const s: string = await repo.one("x");
    const n: number = await repo.two(1);

    expect(s).toBe("conn:x");
    expect(n).toBe(11);
  });
});

describe("type derivation", () => {
  it("rejects wrong argument types and unknown methods", () => {
    const repo = bind(conn, fns);

    // @ts-expect-error a number is not a string
    void repo.one(123);
    // @ts-expect-error no such operation
    void repo.nope;
    // @ts-expect-error the connection is already applied
    void repo.one(conn, "x");

    expect(typeof repo.one).toBe("function");
  });
});
