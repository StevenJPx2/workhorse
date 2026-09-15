// imgup plugin: sandbox-tool-only — contributes the upload_image stage tool
// (execs the imgup CLI in the container); no worker routes, webhooks, hooks.

import type { WorkhorsePlugin } from "@workhorse/api";
import { imgupTools } from "./tools";

export const imgupPlugin: WorkhorsePlugin = {
  id: "imgup",
  tools: imgupTools,
};
