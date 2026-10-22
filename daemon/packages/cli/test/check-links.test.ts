import { describe, expect, it } from "@effect/vitest";
import type { AppSpec, Policy } from "@workhorse/protocol";
import { Effect, Exit } from "effect";
import { checkLinks } from "../src/check-links/index.ts";

const key = `${"k".repeat(42)}A`;
const certificate = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n";
const notes: AppSpec = { name: "notes", operations: ["read"], source: "" };

const failure = (policy: Policy, apps: readonly AppSpec[]) =>
  Effect.exit(checkLinks(policy, apps)).pipe(
    Effect.map((exit) => (Exit.isFailure(exit) ? String(exit.cause) : "ok")),
  );

describe("checkLinks", () => {
  it.effect("accepts a pair whose routes, grants and names all hold", () =>
    Effect.gen(function* () {
      const policy: Policy = {
        apps: {},
        peers: {
          laptop: { key, certificate, operations: ["notes.read"] },
          home: { key, certificate, address: "home.lan:7841", operations: [] },
        },
        routes: { journal: "home" },
      };

      expect(yield* failure(policy, [notes])).toBe("ok");
    }),
  );

  it.effect("reports every problem at once", () =>
    Effect.gen(function* () {
      const policy: Policy = {
        apps: {},
        peers: { home: { key, certificate, operations: ["notes.write", "mail.read"] } },
        routes: { notes: "home", journal: "office", net: "home" },
      };

      const message = yield* failure(policy, [notes, { name: "link", operations: [], source: "" }]);

      for (const problem of [
        "app name link is reserved",
        "route journal names unknown peer office",
        "app notes is installed here and also routed to home",
        "net cannot be routed to a peer",
        "peer home is granted notes.write, which no installed app provides",
        "peer home is granted mail.read, which no installed app provides",
      ]) {
        expect(message).toContain(problem);
      }
    }),
  );
});
