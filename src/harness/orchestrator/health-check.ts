/**
 * Agent health checking - tmux session and OpenCode SDK status
 */

import type { HealthCheckResult } from "./types.ts";
import { sessionExists, capturePane } from "../session/tmux/index.ts";
import {
  checkOpenCodeHealth,
  getOpenCodeStatus,
} from "./opencode-client/index.ts";
import { getAgent, updateAgentState } from "./agent-store.ts";

export async function checkAgentHealth(
  ticketId: string
): Promise<HealthCheckResult> {
  const instance = getAgent(ticketId);
  const now = new Date().toISOString();

  if (!instance) {
    return {
      ticketId,
      healthy: false,
      sessionExists: false,
      checkedAt: now,
    };
  }

  const exists = await sessionExists(ticketId);
  const output = exists ? (await capturePane(ticketId)) ?? undefined : undefined;

  let openCodeHealthy = false;
  let openCodeStatus: HealthCheckResult["openCodeStatus"];

  if (instance.agentType === "opencode" && exists) {
    const health = await checkOpenCodeHealth(ticketId);
    openCodeHealthy = health.healthy;

    const status = await getOpenCodeStatus(ticketId);
    openCodeStatus = status;
  }

  instance.lastHealthCheck = now;

  const tmuxHealthy = exists && instance.state === "running";
  const agentHealthy = instance.agentType === "opencode"
    ? tmuxHealthy && openCodeHealthy
    : tmuxHealthy;

  if (!exists && instance.state === "running") {
    updateAgentState(ticketId, "crashed");
  }

  if (exists && instance.agentType === "opencode" && openCodeStatus?.type === "offline") {
    const startedAt = instance.startedAt ? new Date(instance.startedAt).getTime() : 0;
    const runningFor = Date.now() - startedAt;
    if (runningFor > 30000) {
      updateAgentState(ticketId, "crashed");
    }
  }

  return {
    ticketId,
    healthy: agentHealthy,
    sessionExists: exists,
    openCodeHealthy,
    openCodeStatus,
    lastOutput: output,
    checkedAt: now,
  };
}