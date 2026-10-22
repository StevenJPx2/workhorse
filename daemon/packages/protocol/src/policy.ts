import { Schema } from "effect";

// The user's policy (docs/architecture.md, "Policy and leases"). Outside-world access only.

const Name = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/));

export const AppName = Name;

export type AppName = typeof AppName.Type;

// A root's name is what app code uses; the policy alone knows the real folder.
export const RootName = Name;

export type RootName = typeof RootName.Type;

const FsGrant = Schema.Struct({
  roots: Schema.Record(RootName, Schema.String),
  mode: Schema.Literals(["read", "read-write"]),
});

export type FsGrant = typeof FsGrant.Type;

export const AppGrants = Schema.Struct({
  fs: Schema.optionalKey(FsGrant),
});

export type AppGrants = typeof AppGrants.Type;

export const Policy = Schema.Struct({
  apps: Schema.Record(AppName, AppGrants),
});

export type Policy = typeof Policy.Type;
