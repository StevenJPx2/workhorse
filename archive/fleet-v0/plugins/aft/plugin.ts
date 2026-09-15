// aft plugin: sandbox-tool-only — contributes the AFT code-intelligence
// stage tools (outline/zoom/search/inspect/edit) that exec the `aft` CLI
// baked into the sandbox image. No worker routes, webhooks, or hooks.

import type { WorkhorsePlugin } from "@workhorse/api";
import { aftTools } from "./tools";

export const aftPlugin: WorkhorsePlugin = {
  id: "aft",
  tools: aftTools,
};
