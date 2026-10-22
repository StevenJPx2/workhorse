import type { Json, Outcome } from "@workhorse/protocol";
import { Effect } from "effect";
import type { Env } from "../env.ts";
import { unavailable } from "../outcome.ts";

/** Call a public operation on `peer` through its Link object; any failure is `unavailable`. */
export function callPeer(
  env: Env,
  peer: string,
  method: string,
  params: Json | undefined,
): Effect.Effect<Outcome> {
  const link = env.LINK.get(env.LINK.idFromName(peer));

  // The Link object is this daemon's own code; its answer was built as an Outcome.
  return Effect.tryPromise((): PromiseLike<Outcome> => link.call(method, params)).pipe(
    Effect.orElseSucceed(() => unavailable),
  );
}
