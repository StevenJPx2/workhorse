// @workhorse/intake — getting work into the fleet, and keeping it moving.
//
//   file    parse refs out of free text, resolve attachments, create the ticket
//           record + durable workflow instance
//   heal    re-dispatch a dead ticket on a fresh instance that resumes from
//           recorded progress
//   refs    frecency ranking of previously-used context refs
//
// Named `intake` rather than `tickets` because @workhorse/tickets is already the
// PLUGIN that exposes ticket tools to agents. Two packages cannot share a name,
// and this half is the intake seam, not the agent-facing surface.
//
// PROVIDERS ARE INJECTED. Ref parsing and attachment resolution both need the
// plugin attachment providers, and importing the plugin registry here would make
// this package depend on every plugin — the exact coupling Phase 5 removed from
// the worker. `createIntake(providers)` takes them once; the worker binds it to
// its registry at module level.

import type { AttachmentProvider } from "@workhorse/api";
import { fileTicket, resolveAttachments, type FileTicketResult } from "./file";
import { parseRefs, rankedRefs, recordRefUse, type ParsedRef } from "./refs";

export { healTicket } from "./heal";
export type { FileTicketResult, ParsedRef };

/** The attachment providers contributed by plugins, keyed by kind. */
export type Providers = Map<string, AttachmentProvider>;

/**
 * Bind the intake surface to a set of attachment providers.
 *
 * Called once by the composition root. Every returned function closes over the
 * same providers, so a plugin registered late cannot be visible to one half of
 * intake and invisible to the other.
 */
export function createIntake(providers: Providers) {
  return {
    fileTicket: (env: Parameters<typeof fileTicket>[1], body: Parameters<typeof fileTicket>[2]) =>
      fileTicket(providers, env, body),
    resolveAttachments: (
      env: Parameters<typeof resolveAttachments>[1],
      core: Parameters<typeof resolveAttachments>[2],
      attachments: Parameters<typeof resolveAttachments>[3],
    ) => resolveAttachments(providers, env, core, attachments),
    parseRefs: (input: string) => parseRefs(providers, input),
    recordRefUse,
    rankedRefs,
  };
}

export type Intake = ReturnType<typeof createIntake>;
