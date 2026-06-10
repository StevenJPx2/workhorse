import z from "zod";

import { StateConfig } from "./state";
import { StepConfig } from "./step";

/** A workflow type: the stage machine plus the step library it references. */
export const WorkflowConfig = z.object({
  name: z.string(),
  states: z.array(StateConfig).min(1),
  steps: z.record(z.string(), StepConfig),
  version: z.string(),
});

export type WorkflowConfigT = z.infer<typeof WorkflowConfig>;
