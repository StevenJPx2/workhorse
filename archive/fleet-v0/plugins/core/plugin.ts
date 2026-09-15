// Core plane: the workspace tools every stage can have.
//
// A plugin like any other, so nothing has to special-case "builtins". The worker
// registers it first, and an agent imports the individual tools it wants.
import type { WorkhorsePlugin } from "@workhorse/api";
import { coreTools } from "./tools";

export const corePlugin: WorkhorsePlugin = {
  id: "core",
  tools: coreTools,
};
