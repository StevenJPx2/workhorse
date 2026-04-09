/**
 * WorkflowContext - Provides ticket workflow to the component tree
 *
 * Wraps useTicketWorkflow hook into a context to avoid prop drilling
 * the workflow instance through multiple component layers.
 */

import { createContext, useContext, type JSX } from "solid-js";
import {
  useTicketWorkflow,
  type UseTicketWorkflowReturn,
  type UseTicketWorkflowOptions,
} from "../hooks/use-ticket-workflow/index.ts";

const WorkflowContext = createContext<UseTicketWorkflowReturn>();

/**
 * Props for the WorkflowProvider component
 */
export interface WorkflowProviderProps extends UseTicketWorkflowOptions {
  children: JSX.Element;
}

/**
 * Provider component that sets up workflow state
 */
export function WorkflowProvider(props: WorkflowProviderProps) {
  const workflow = useTicketWorkflow({
    repoPath: props.repoPath,
    jiraCloudId: props.jiraCloudId,
    healthCheckInterval: props.healthCheckInterval,
    onAgentStateChange: props.onAgentStateChange,
    onError: props.onError,
  });

  return (
    <WorkflowContext.Provider value={workflow}>
      {props.children}
    </WorkflowContext.Provider>
  );
}

/**
 * Hook to consume the WorkflowContext
 *
 * @throws Error if used outside of WorkflowProvider
 */
export function useWorkflowContext(): UseTicketWorkflowReturn {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflowContext must be used within a WorkflowProvider");
  }
  return context;
}
