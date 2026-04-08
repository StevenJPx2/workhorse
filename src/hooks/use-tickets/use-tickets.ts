/**
 * useTickets hook - Ticket CRUD operations
 *
 * Provides reactive ticket management with database persistence.
 */

import { createSignal } from "solid-js";
import type { Ticket, TicketStatus } from "../../types/ticket.ts";
import {
  insertTicket,
  getTicketById,
  getTicketsByRig,
  getAllTickets,
  updateTicketStatus,
  deleteTicket,
  updateTicket,
} from "../../lib/db/index.ts";
import type {
  UseTicketsOptions,
  UseTicketsReturn,
  CreateTicketInput,
  UpdateTicketInput,
} from "./types.ts";
import { resolveRig } from "./types.ts";

/**
 * Hook for managing tickets with database persistence
 *
 * @example
 * ```tsx
 * function TicketList() {
 *   const { tickets, create, setStatus, reload } = useTickets({
 *     rig: 'github.com/user/repo',
 *     autoLoad: true,
 *   });
 *
 *   const handleAdd = () => {
 *     create({
 *       jiraKey: 'AM-123',
 *       rig: 'github.com/user/repo',
 *       summary: 'Fix bug',
 *     });
 *   };
 *
 *   return (
 *     <box>
 *       <For each={tickets()}>
 *         {(ticket) => <TicketItem ticket={ticket} />}
 *       </For>
 *     </box>
 *   );
 * }
 * ```
 */
export function useTickets(options: UseTicketsOptions = {}): UseTicketsReturn {
  const [tickets, setTickets] = createSignal<Ticket[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const reload = (): void => {
    try {
      setIsLoading(true);
      setError(null);

      const rigValue = resolveRig(options.rig);
      const loaded = rigValue ? getTicketsByRig(rigValue) : getAllTickets();

      setTickets(loaded);
      options.onChange?.(loaded);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    } finally {
      setIsLoading(false);
    }
  };

  const get = (id: string): Ticket | null => {
    return getTicketById(id);
  };

  const create = (input: CreateTicketInput): Ticket => {
    try {
      const ticket = insertTicket({
        id: input.jiraKey,
        jira_key: input.jiraKey,
        rig: input.rig,
        jira_url: input.jiraUrl,
        summary: input.summary,
        agent: input.agent,
      });
      reload();
      return ticket;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  };

  const update = (id: string, input: UpdateTicketInput): void => {
    try {
      const updates: Record<string, unknown> = {};

      if (input.summary !== undefined) updates.summary = input.summary;
      if (input.status !== undefined) updates.status = input.status;
      if (input.worktreePath !== undefined)
        updates.worktree_path = input.worktreePath;
      if (input.branchName !== undefined) updates.branch_name = input.branchName;
      if (input.agent !== undefined) updates.agent = input.agent;
      if (input.agentPid !== undefined) updates.agent_pid = input.agentPid;
      if (input.prUrl !== undefined) updates.pr_url = input.prUrl;

      if (Object.keys(updates).length > 0) {
        updateTicket(id, updates);
        reload();
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  };

  const setStatus = (id: string, status: TicketStatus): void => {
    try {
      updateTicketStatus(id, status);
      reload();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  };

  const remove = (id: string): void => {
    try {
      deleteTicket(id);
      reload();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  };

  const findByStatus = (status: TicketStatus): Ticket[] => {
    return tickets().filter((t) => t.status === status);
  };

  // Auto-load if requested
  if (options.autoLoad) {
    reload();
  }

  return {
    tickets,
    isLoading,
    error,
    reload,
    get,
    create,
    update,
    setStatus,
    remove,
    findByStatus,
  };
}
