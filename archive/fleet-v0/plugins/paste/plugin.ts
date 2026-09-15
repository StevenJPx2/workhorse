// paste plugin: sandbox-tool-only — contributes the upload_text stage tool
// (raw curl-able text hosting via paste.rs & friends). No worker routes,
// webhooks, or hooks.

import type { WorkhorsePlugin } from "@workhorse/api";
import { pasteTools } from "./tools";

export const pastePlugin: WorkhorsePlugin = {
  id: "paste",
  tools: pasteTools,
};
