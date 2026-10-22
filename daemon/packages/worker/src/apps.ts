import type { WorkerEntrypoint } from "cloudflare:workers";
import { type AppSpec, COMPATIBILITY_DATE, type Json, Outcome } from "@workhorse/protocol";
import { type Cause, Effect, Option, Schema } from "effect";
import type { Env } from "./env.ts";
import { failed, unavailable } from "./outcome.ts";

// What apps need from workerd's ExecutionContext: a loopback to the daemon's Fs capability.
export type Context = {
  readonly exports: {
    readonly Fs: (options: { readonly props: { readonly app: string } }) => Fetcher;
  };
};

// Every app call has a deadline; a slow app answers `unavailable`, never holds the connection.
const APP_DEADLINE = "10 seconds";

// What every app exports. The daemon trusts none of what it returns.
declare abstract class AppEntrypoint extends WorkerEntrypoint {
  invoke(operation: string, params: Json | undefined): Promise<Json>;
}

const decodeOutcome = Schema.decodeUnknownOption(Outcome);

export const callApp = Effect.fnUntraced(
  function* (
    env: Env,
    ctx: Context,
    app: AppSpec,
    operation: string,
    params: Json | undefined,
  ): Effect.fn.Return<Outcome, Cause.UnknownError> {
    // Loaded once per name and reused. No network: its only reach is the bindings in `env`.
    const worker = env.LOADER.get(`app:${app.name}`, () => ({
      compatibilityDate: COMPATIBILITY_DATE,
      mainModule: "app.js",
      modules: { "app.js": app.source },
      env: { FS: ctx.exports.Fs({ props: { app: app.name } }) },
      globalOutbound: null,
    }));

    const entry = worker.getEntrypoint<AppEntrypoint>();

    // Whatever the app sends back is decoded below; until then it is only a promised value.
    const raw = yield* Effect.tryPromise((): PromiseLike<Schema.Json> =>
      entry.invoke(operation, params),
    );

    return Option.getOrElse(decodeOutcome(raw), () => failed("invalid_app_outcome"));
  },
  Effect.timeoutOrElse({ duration: APP_DEADLINE, orElse: () => Effect.succeed(unavailable) }),
  Effect.orElseSucceed(() => failed("app_error")),
);
