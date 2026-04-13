/**
 * Ticket Agent Workflow - Core business logic for agent lifecycle
 *
 * This module consolidates all agent lifecycle operations:
 * - launchTicketAgent: Start work on a ticket (spawns agent in worktree)
 * - haltTicketAgent: Stop work on a ticket (stops agent, optionally removes worktree)
 * - restartTicketAgent: Restart an agent for an existing ticket
 * - resumeAllTicketAgents: Resume all tickets in active states
 *
 * All functions are pure business logic with no Solid.js dependencies.
 * They directly use the orchestrator for agent operations.
 */

export { launchTicketAgent } from "./launch.ts";
export { haltTicketAgent } from "./halt.ts";
export { restartTicketAgent } from "./restart.ts";
export { resumeAllTicketAgents, ACTIVE_TICKET_STATUSES } from "./resume-all.ts";
export { isAgentRunning } from "./is-agent-running.ts";
