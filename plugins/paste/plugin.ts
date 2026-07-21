// paste plugin: sandbox-only — contributes the upload_text Pi tool
// (extension.ts: raw curl-able text hosting via paste.rs & friends).
// No worker routes, webhooks, or hooks.

import type { WorkhorsePlugin } from "@workhorse/api";

export const pastePlugin: WorkhorsePlugin = {
  id: "paste",
};
