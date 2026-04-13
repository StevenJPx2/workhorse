/**
 * Setup command definition
 */

import { defineCommand } from "citty";
import { runSetup } from "./run.ts";

export default defineCommand({
  meta: {
    name: "setup",
    description: "First-time setup and configuration",
  },
  async run() {
    await runSetup();
  },
});
