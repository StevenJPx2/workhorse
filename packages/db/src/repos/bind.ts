// Turns a namespace of `(d, ...args)` functions into a repo object with `d`
// already applied.
//
// This is what makes the function-per-file layout viable. The naive version of
// this pattern hand-writes a builder that re-binds each function, which declares
// every signature TWICE — once on the function, once in the builder — so the two
// drift as the repo grows. Here the bound type is DERIVED, so adding a function
// to a repo directory needs no other edit and cannot fall out of sync.

import type { DrizzleD1Database } from "drizzle-orm/d1";

/** The one argument every repo function takes first. */
export type Conn = DrizzleD1Database;

/** Any repo function: a connection, then its own arguments. */
type RepoFn = (d: Conn, ...args: never[]) => unknown;

/** A namespace of repo functions with the leading `Conn` parameter removed. */
export type Bound<T> = {
  [K in keyof T]: T[K] extends (d: Conn, ...args: infer A) => infer R ? (...args: A) => R : never;
};

/**
 * Apply `d` to every function in `fns`.
 *
 * Types survive: `db.tickets.get("id")` keeps its parameter and return types, an
 * unknown method is a compile error, and a wrong argument type still fails.
 */
export function bind<T extends Record<string, RepoFn>>(d: Conn, fns: T): Bound<T> {
  return Object.fromEntries(
    Object.entries(fns).map(([name, fn]) => [name, (...args: never[]) => fn(d, ...args)]),
  ) as Bound<T>;
}
