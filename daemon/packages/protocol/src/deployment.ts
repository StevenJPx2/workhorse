import { Schema } from "effect";
import { ErrorObject } from "./jsonrpc.ts";
import { AppName, Policy, RootName } from "./policy.ts";

// What `workhorse install` hands the daemon, and what apps hand back. Both sides are generated
// or loaded separately, so this is a contract like the wire protocol.

export const OperationName = Schema.String.check(Schema.isPattern(/^[a-z][a-zA-Z0-9]{0,62}$/));

export type OperationName = typeof OperationName.Type;

// An app's manifest.json, written by its author: its name and its public operations.
export const AppManifest = Schema.Struct({
  name: AppName,
  operations: Schema.Array(OperationName),
});

// An app the daemon loads as a Dynamic Worker. `source` is its bundled ES module.
const AppSpec = Schema.Struct({
  ...AppManifest.fields,
  source: Schema.String,
});

export type AppSpec = typeof AppSpec.Type;

export const Deployment = Schema.Struct({
  policy: Policy,
  apps: Schema.Array(AppSpec),
});

export type Deployment = typeof Deployment.Type;

// The binding name of one granted root's disk directory. Names cannot contain ":", so the
// result is unambiguous.
export function rootBinding(app: AppName, root: RootName): `fs:${string}` {
  return `fs:${app}:${root}`;
}

// What an app operation, or a capability call, returns. Apps are untrusted: the daemon decodes this.
export const Outcome = Schema.Union([
  Schema.Struct({ result: Schema.Json }),
  Schema.Struct({ error: ErrorObject }),
]);

export type Outcome = typeof Outcome.Type;
