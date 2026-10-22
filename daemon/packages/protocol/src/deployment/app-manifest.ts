import { Schema } from "effect";
import { AppName } from "../policy/index.ts";

/** The name of an app's public operation; its method is `<app>.<operation>`. */
export const OperationName = Schema.String.check(Schema.isPattern(/^[a-z][a-zA-Z0-9]{0,62}$/));

export type OperationName = typeof OperationName.Type;

/** An app's manifest.json, written by its author: its name and its public operations. */
export const AppManifest = Schema.Struct({
  name: AppName,
  operations: Schema.Array(OperationName),
});

/** An app the daemon loads as a Dynamic Worker. `source` is its bundled ES module. */
export const AppSpec = Schema.Struct({
  ...AppManifest.fields,
  source: Schema.String,
});

export type AppSpec = typeof AppSpec.Type;
