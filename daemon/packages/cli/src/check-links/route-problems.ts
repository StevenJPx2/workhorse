import type { Policy } from "@workhorse/protocol";
import { RESERVED } from "./reserved.ts";

/**
 * Routes that cannot work: to a peer the policy does not pair, for an app also installed here
 * (which would be served twice), or for a reserved name.
 */
export function routeProblems(policy: Policy, installed: ReadonlySet<string>): readonly string[] {
  const peers = policy.peers ?? {};
  const problems: string[] = [];

  for (const [app, peer] of Object.entries(policy.routes ?? {})) {
    if (!Object.hasOwn(peers, peer)) problems.push(`route ${app} names unknown peer ${peer}`);

    if (installed.has(app))
      problems.push(`app ${app} is installed here and also routed to ${peer}`);

    if (RESERVED.has(app)) problems.push(`${app} cannot be routed to a peer`);
  }

  return problems;
}
