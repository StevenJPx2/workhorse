import type { Setter } from "solid-js";
import type { UseAgentReturn } from "../use-agent/types.ts";
import type { UseEventLogReturn } from "../use-event-log/types.ts";

export interface WorkflowDeps {
  setIsLoading: Setter<boolean>;
  setError: Setter<Error | null>;
  handleError: (err: unknown) => Error;
  agent: UseAgentReturn;
  eventLog?: UseEventLogReturn;
}
