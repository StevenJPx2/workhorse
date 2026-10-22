import type { Policy } from "@workhorse/protocol";

/** Operations granted to a peer that no installed app declares. `operations` maps app to its operations. */
export function grantProblems(
  policy: Policy,
  operations: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] {
  return Object.entries(policy.peers ?? {}).flatMap(([peer, entry]) =>
    entry.operations.flatMap((method) => {
      const [app = "", operation = ""] = method.split(".");

      return operations.get(app)?.has(operation) === true
        ? []
        : [`peer ${peer} is granted ${method}, which no installed app provides`];
    }),
  );
}
