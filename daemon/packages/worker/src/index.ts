import { Effect } from "effect";
import { serve } from "./connection.ts";
import { deploymentOf, type Env } from "./env.ts";
import { acceptUpgrade } from "./link/accept-upgrade.ts";

export { Fs } from "./fs.ts";

export { Link } from "./link/link-object.ts";

export default {
  // workerd hands each connection on the daemon's socket to `connect`.
  connect(socket, env, ctx) {
    return Effect.runPromise(serve(socket, env, ctx));
  },
  // The HTTPS socket, present when installed with --listen, serves only link upgrades.
  fetch(request, env) {
    const forward = (peer: string, upgrade: Request) =>
      env.LINK.get(env.LINK.idFromName(peer)).fetch(upgrade);

    return Effect.runPromise(acceptUpgrade(request, deploymentOf(env), forward));
  },
} satisfies ExportedHandler<Env>;
