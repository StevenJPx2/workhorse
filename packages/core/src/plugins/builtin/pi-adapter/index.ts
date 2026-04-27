/**
 * Builtin Pi Coding Agent adapter plugin.
 *
 * @module plugins/builtin/pi-adapter
 */

import { definePlugin } from "../../define.ts";
import { PiAgentAdapter } from "./adapter.ts";

export { PiAgentAdapter } from "./adapter.ts";

export const piAdapterPlugin = definePlugin({
  manifest: {
    name: "builtin-pi-adapter",
    version: "1.0.0",
    description: "Pi Coding Agent adapter",
    capabilities: {
      adapters: ["pi-coding-agent"],
    },
  },
  setup(ctx) {
    ctx.orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter);
  },
});
