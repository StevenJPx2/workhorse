import type { AppSpec, Policy } from "@workhorse/protocol";
import { Effect } from "effect";
import { InstallError } from "../inputs.ts";
import { grantProblems } from "./grant-problems.ts";
import { nameProblems } from "./name-problems.ts";
import { routeProblems } from "./route-problems.ts";

/**
 * Checks across the policy and the installed apps that no schema can make. Every problem is
 * reported at once; a mistake is refused, never ignored.
 */
export function checkLinks(
  policy: Policy,
  apps: readonly AppSpec[],
): Effect.Effect<void, InstallError> {
  const operations = new Map(apps.map((app) => [app.name, new Set(app.operations)]));

  const problems = [
    ...nameProblems(apps),
    ...routeProblems(policy, new Set(operations.keys())),
    ...grantProblems(policy, operations),
  ];

  return problems.length === 0
    ? Effect.void
    : Effect.fail(new InstallError({ message: `invalid policy: ${problems.join("; ")}` }));
}
