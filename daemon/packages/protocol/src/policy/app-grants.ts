import { Schema } from "effect";
import { RootName } from "./names.ts";

/** Access to named folders; app code uses the root's name, never its path. */
const FsGrant = Schema.Struct({
  roots: Schema.Record(RootName, Schema.String),
  mode: Schema.Literals(["read", "read-write"]),
});

export type FsGrant = typeof FsGrant.Type;

/** One app's outside-world access. Internal features need no grant. */
export const AppGrants = Schema.Struct({
  fs: Schema.optionalKey(FsGrant),
});

export type AppGrants = typeof AppGrants.Type;
