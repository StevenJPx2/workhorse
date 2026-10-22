import { WorkerEntrypoint } from "cloudflare:workers";
import type { Outcome } from "@workhorse/protocol";
import { type Cause, Effect, type Schema } from "effect";
import { deploymentOf, type Env } from "./env.ts";
import { failed } from "./outcome.ts";
import { planRead, readResponse } from "./read.ts";

type FsProps = { readonly app: string };

// The file capability an app receives as `env.FS`. `props.app` names the caller.
export class Fs extends WorkerEntrypoint<Env, FsProps> {
  // fallow-ignore-next-line unused-class-member -- apps call this over Workers RPC
  read(root: Schema.Json, path: Schema.Json): Promise<Outcome> {
    return Effect.runPromise(readFile(this.env, this.ctx.props.app, [root, path]));
  }
}

const readFile = Effect.fnUntraced(
  function* (
    env: Env,
    app: string,
    args: readonly Schema.Json[],
  ): Effect.fn.Return<Outcome, Cause.UnknownError> {
    const plan = planRead(deploymentOf(env), app, args);

    if (plan.type === "answer") return plan.outcome;
    const disk = env[plan.binding];

    if (disk === undefined) return failed("root_not_configured");

    return yield* readResponse(yield* Effect.tryPromise(() => disk.fetch(plan.url)));
  },
  Effect.orElseSucceed(() => failed("io_error")),
);
