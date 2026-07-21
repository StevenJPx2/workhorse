// imgup plugin: sandbox-only — contributes the upload_image Pi tool
// (extension.ts); no worker routes, webhooks, or hooks.

import type { WorkhorsePlugin } from "@workhorse/api";

export const imgupPlugin: WorkhorsePlugin = {
  id: "imgup",
};
