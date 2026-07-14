import type { GlobalContext } from "#orchestrator";

export interface WorkflowContext extends GlobalContext {
  cwd: string;
}
