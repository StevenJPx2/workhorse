// Browser plane (Worker half).
//
// All browser operations run in the sandbox via agent-browser (persistent
// sessions, AX snapshots, click/fill/record). Under the flue engine the tool
// definitions live here as a factory (tools.ts) that the worker assembles;
// each tool execs the agent-browser wrapper in the container. Stateless
// reads use jina (web_search/web_read, the search plugin).

import type { WorkhorsePlugin } from "@workhorse/api";
import { browserTools } from "./tools";

export const browserPlugin: WorkhorsePlugin = {
  id: "browser",
  tools: browserTools,
};
