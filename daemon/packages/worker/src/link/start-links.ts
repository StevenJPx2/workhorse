import type { Policy } from "@workhorse/protocol";
import { Effect } from "effect";
import type { Env } from "../env.ts";

let started = false;

/**
 * Ask the Link object of every peer the policy gives an address to dial it. Once per isolate:
 * a new Link object does not dial by itself (spike 6), and `workhorse warm` connects after every
 * daemon start, so this runs on the first connection.
 */
export function startLinks(env: Env, policy: Policy): Effect.Effect<void> {
  if (started) return Effect.void;
  started = true;

  const dialed = Object.entries(policy.peers ?? {}).filter(
    ([, peer]) => peer.address !== undefined,
  );

  return Effect.forEach(
    dialed,
    ([name]) =>
      Effect.tryPromise(() => env.LINK.get(env.LINK.idFromName(name)).start(name)).pipe(
        Effect.ignore,
      ),
    { discard: true },
  );
}
