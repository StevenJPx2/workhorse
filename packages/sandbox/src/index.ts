// @workhorse/sandbox — the container plane.
//
//   driver    the Driver adapter (@workhorse/workflow's sandbox I/O over
//             @cloudflare/sandbox), credential/config injection, workspace
//             preparation, the dependency cache, and branch delivery
//   codemode  Code Mode: the agent writes ONE program that chains tools inside a
//             disposable dynamic worker with no network
//
// Both halves take their composition-root dependencies as parameters. Reaching
// into the plugin registry from here would make this package depend on every
// plugin — the coupling Phase 5 removed from the worker.

export {
  checkoutTicketBranch,
  deliverBranch,
  depCacheKey,
  injectAuth,
  injectBrowserConfig,
  injectImgupConfig,
  injectTicketContext,
  prepareWorkspace,
  restoreDepCache,
  sandboxDriver,
  saveDepCache,
} from "./driver";

export { makeToolBridge, runCode } from "./codemode";
export type { BridgeDeps, RunCodeResult, ToolBridgeProps } from "./codemode";
