// The Code Mode ToolBridge, bound to this worker's plugin registry.
//
// The PLATFORM constructs this class — wrangler wires it by name from the
// worker's exports — so it cannot take constructor arguments. @workhorse/sandbox
// therefore exposes a factory, and this is the one place that supplies the two
// composition-root dependencies it needs.

import { makeToolBridge } from "@workhorse/sandbox";
import { coreFor } from "./core";
import { assembleStageTools } from "./registry";

/** Loopback entrypoint for Code Mode dynamic workers (ctx.exports.ToolBridge). */
export const ToolBridge = makeToolBridge({ assembleStageTools, coreFor });
