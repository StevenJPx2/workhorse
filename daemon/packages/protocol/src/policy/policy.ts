import { Schema } from "effect";
import { AppGrants } from "./app-grants.ts";
import { AppName, PeerName } from "./names.ts";
import { Peer } from "./peer.ts";

/**
 * The user's policy (docs/architecture.md, "Policy and leases" and "Remote links"): each app's
 * outside-world access, the paired daemons, and which apps live on which peer.
 */
export const Policy = Schema.Struct({
  apps: Schema.Record(AppName, AppGrants),
  peers: Schema.optionalKey(Schema.Record(PeerName, Peer)),
  routes: Schema.optionalKey(Schema.Record(AppName, PeerName)),
});

export type Policy = typeof Policy.Type;
