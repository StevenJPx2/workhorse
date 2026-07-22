// Browser plane (Worker half).
//
// All browser operations live in the sandbox via agent-browser (persistent
// sessions, AX snapshots, click/fill/record). Stateless reads use jina
// (web_search/web_read) or lightpanda as fallback.
//
// This file exists to provide BROWSER_TOKEN to the sandbox environment
// (injected during prepareWorkspace) so the extension tools can call back
// to the worker for auth-gated operations.

import type { WorkhorsePlugin } from "@workhorse/api";

export const browserPlugin: WorkhorsePlugin = {
  id: "browser",
};
