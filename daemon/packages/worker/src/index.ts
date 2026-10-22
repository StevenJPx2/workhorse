import { Effect } from "effect";
import { serve } from "./connection.ts";
import type { Env } from "./env.ts";

export { Fs } from "./fs.ts";

// workerd hands each connection on the daemon's socket to `connect`.
export default {
  connect(socket, env, ctx) {
    return Effect.runPromise(serve(socket, env, ctx));
  },
} satisfies ExportedHandler<Env>;
