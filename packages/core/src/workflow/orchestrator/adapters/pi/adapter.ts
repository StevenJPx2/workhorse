/**
 * Pi Coding Agent adapter.
 *
 * Uses @mariozechner/pi-coding-agent SDK directly (no subprocess, no TUI).
 * Session files are stored in `.jiratown/session/` inside the worktree.
 *
 * @module workflow/orchestrator/adapters/pi/adapter
 */

import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

import type { AgentAdapter, AgentHarness, AgentState } from "../../types/index.ts";
import type { AdapterContext } from "../types.ts";
import { createExtensionFromTools, handleSessionEvent } from "./events.ts";

/**
 * Pi Coding Agent adapter implementation.
 *
 * Implements AgentAdapter interface by wrapping the pi SDK session.
 */
export class PiAgentAdapter implements AgentAdapter {
  readonly harness: AgentHarness = "pi-coding-agent";
  readonly issueId: string;
  readonly worktreePath: string;
  state: AgentState = "stopped";

  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly ctx: AdapterContext) {
    this.issueId = ctx.issue.externalId;
    this.worktreePath = ctx.worktreePath;
  }

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
          setState: (s) => {
            this.state = s;
          },
          getIssueStatus: () => {
            const issue = this.ctx.db.issues.getByExternalId(
              this.ctx.issue.externalId,
              this.ctx.issue.source,
            );
            return issue?.status ?? this.ctx.issue.status;
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
