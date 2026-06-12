import { createHooks } from "hookable";

import { ResolvedConfig } from "#config";
import type { Hooks } from "#hooks";
import type { WorkflowContext } from "#workflow";

export function context(cwd = "/tmp/workhorse"): WorkflowContext {
  return {
    config: ResolvedConfig.parse({}),
    cwd,
    hooks: createHooks<Hooks>(),
  };
}
