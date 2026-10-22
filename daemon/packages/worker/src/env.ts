import { Deployment } from "@workhorse/protocol";
import { Option, Schema } from "effect";

// Bindings that `workhorse install` writes into the workerd configuration.
export interface Env {
  // JSON written by the CLI; decoded before use like any other input.
  readonly DEPLOYMENT: Schema.Json;
  readonly LOADER: WorkerLoader;
  // One disk directory per granted root, named by `rootBinding`.
  readonly [binding: `fs:${string}`]: Fetcher | undefined;
}

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import("./index.ts");
    }
  }
}

const decodeDeployment = Schema.decodeUnknownOption(Deployment);

// Decoded once per isolate. An invalid deployment refuses every connection.
let deployment: Option.Option<Deployment> | undefined;

export function deploymentOf(env: Env): Option.Option<Deployment> {
  deployment ??= decodeDeployment(env.DEPLOYMENT);

  return deployment;
}
