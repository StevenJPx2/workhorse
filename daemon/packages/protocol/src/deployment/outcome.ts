import { Schema } from "effect";
import { ErrorObject } from "../jsonrpc.ts";

/** What an app operation, or a capability call, returns. Apps are untrusted: the daemon decodes this. */
export const Outcome = Schema.Union([
  Schema.Struct({ result: Schema.Json }),
  Schema.Struct({ error: ErrorObject }),
]);

export type Outcome = typeof Outcome.Type;
