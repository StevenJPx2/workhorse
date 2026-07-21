// tickets plugin: sandbox-only — contributes the workhorse_* Pi tools
// (extension.ts: file/list/status/diff tickets via the worker API). The
// ticket API routes themselves are core (worker), not plugin surface.

import type { WorkhorsePlugin } from "@workhorse/api";

export const ticketsPlugin: WorkhorsePlugin = {
  id: "tickets",
};
