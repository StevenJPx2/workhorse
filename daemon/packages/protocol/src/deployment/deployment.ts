import { Schema } from "effect";
import { Policy } from "../policy.ts";
import { AppSpec } from "./app-manifest.ts";

/**
 * What `workhorse install` hands the daemon: the user's policy and the apps to load. Both sides
 * are generated or loaded separately, so this is a contract like the wire protocol.
 */
export const Deployment = Schema.Struct({
  policy: Policy,
  apps: Schema.Array(AppSpec),
});

export type Deployment = typeof Deployment.Type;
