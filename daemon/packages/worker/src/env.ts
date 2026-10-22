import { Deployment } from "@workhorse/protocol";
import { Option, Schema } from "effect";
import type { Link } from "./link/link-object.ts";

// Bindings that `workhorse install` writes into the workerd configuration.
export interface Env {
  // JSON written by the CLI; decoded before use like any other input.
  readonly DEPLOYMENT: Schema.Json;
  // This daemon's Ed25519 key pair as a JWK, also written by the CLI and decoded before use.
  readonly IDENTITY: Schema.Json;
  readonly LOADER: WorkerLoader;
  // One Link object per paired peer, named by the peer.
  readonly LINK: DurableObjectNamespace<Link>;
  // One disk directory per granted root, named by `rootBinding`.
  readonly [binding: `fs:${string}`]: Fetcher | undefined;
  // One pinned TLS service per peer this daemon dials, named by `peerBinding`.
  readonly [binding: `peer:${string}`]: Fetcher | undefined;
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
