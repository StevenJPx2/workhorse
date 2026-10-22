import type { LinkContext } from "@workhorse/core";
import type { AppSpec } from "@workhorse/protocol";
import type { Context } from "../apps.ts";
import type { Env } from "../env.ts";

/** What a session needs from its Link object: the apps a peer may call, and this daemon's key. */
export type SessionDeps = {
  readonly env: Env;
  readonly ctx: Context;
  readonly context: LinkContext;
  readonly specs: ReadonlyMap<string, AppSpec>;
  readonly privateKey: CryptoKey;
};
