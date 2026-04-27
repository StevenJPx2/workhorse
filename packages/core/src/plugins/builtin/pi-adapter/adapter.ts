/**
 * Pi Coding Agent adapter.
 *
 * Uses @mariozechner/pi-coding-agent SDK directly (no subprocess, no TUI).
 * Session files are stored in `.jiratown/session/` inside the worktree.
 *
 * @module plugins/builtin/pi-adapter/adapter
 */

import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

import { AgentAdapter } from "#workflow/orchestrator";
import type { AgentState } from "#workflow/orchestrator";
import { createExtensionFromTools, handleSessionEvent } from "./events.ts";

/**
 * Pi Coding Agent adapter implementation.
 *
 * Extends AgentAdapter to wrap the pi SDK session.
 */
export class PiAgentAdapter extends AgentAdapter {
  readonly harness = "pi-coding-agent";

  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Start the agent session. */
  async start(): Promise<void> {
    if (this.session) {
      throw new Error("Session already started");
    }

    this.state = "starting";

    try {
      const loader = new DefaultResourceLoader({
        cwd: this.worktreePath,
        agentDir: getAgentDir(),
        systemPromptOverride: () => this.ctx.systemPrompt,
        extensionFactories: [
          createExtensionFromTools(this.ctx.tools, {
            issueId: this.issueId,
            worktreePath: this.worktreePath,
            db: this.ctx.db,
            hooks: this.ctx.hooks,
            memory: this.ctx.memory,
          }),
        ],
      });
      await loader.reload();

      const { session } = await createAgentSession({
        cwd: this.worktreePath,
        resourceLoader: loader,
        sessionManager: SessionManager.create(this.worktreePath),
      });

      this.session = session;
      this.unsubscribe = session.subscribe((event: AgentSessionEvent) =>
        handleSessionEvent(event, {
          issueId: this.issueId,
          worktreePath: this.worktreePath,
          hooks: this.ctx.hooks,
          memory: this.ctx.memory,
          setState: (s: AgentState) => {
            this.state = s;
          },
          getIssueStatus: () => {
            return (
              this.ctx.db.issues.getByExternalId(this.ctx.issue.externalId, this.ctx.issue.source)
                ?.status ?? this.ctx.issue.status
            );
          },
        }),
      );
      this.state = "running";
      await session.prompt(this.ctx.initialMessage);
    } catch (error) {
      this.state = "crashed";
      this.ctx.hooks.emit("agent.crashed", {
        issueId: this.issueId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /** Send a message to the running agent. */
  async sendMessage(content: string): Promise<void> {
    if (!this.session) {
      throw new Error("Session not started");
    }

    if (this.session.isStreaming) {
      await this.session.steer(content);
    } else {
      await this.session.prompt(content);
    }
  }

  /** Stop the agent session. */
  async stop(): Promise<void> {
    if (!this.session) {
      return;
    }

    this.state = "stopping";

    try {
      this.unsubscribe?.();
      this.session.dispose();
    } finally {
      this.session = null;
      this.unsubscribe = null;
      this.state = "stopped";
    }
  }

  /** Check if the agent is currently running/streaming. */
  isRunning(): boolean {
    return this.session?.isStreaming ?? false;
  }
}
