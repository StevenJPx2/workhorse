/**
 * Pi Coding Agent adapter.
 *
 * Uses @mariozechner/pi-coding-agent SDK directly (no subprocess, no TUI).
 * Session files are stored in `.jiratown/session/` inside the worktree.
 *
 * @module @jiratown/plugin-pi-adapter/adapter
 */

import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

import { AgentAdapter } from "@jiratown/core";
import type { AgentState } from "@jiratown/core";
import { createExtensionFromTools, handleSessionEvent } from "./events.ts";

/**
 * Pi Coding Agent adapter implementation.
 *
 * Extends AgentAdapter to wrap the pi SDK session.
 */
export class PiAgentAdapter extends AgentAdapter {
  override readonly harness = "pi-coding-agent";

  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Start the agent session via doStart(). Called by base class start(). */
  protected override async doStart(): Promise<void> {
    if (this.session) {
      throw new Error("Session already started");
    }

    const loader = new DefaultResourceLoader({
      cwd: this.worktreePath,
      agentDir: getAgentDir(),
      systemPromptOverride: () => this.systemPrompt,
      extensionFactories: [
        createExtensionFromTools(this.tools, {
          issueId: this.issueId,
          worktreePath: this.worktreePath,
          db: this.db,
          hooks: this.hooks,
          memory: this.memory,
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
        hooks: this.hooks,
        memory: this.memory,
        setState: (s: AgentState) => {
          this.state = s;
        },
        getIssueStatus: () => {
          return (
            this.db.issues.getByExternalId(this.issue.externalId, this.issue.source)?.status ??
            this.issue.status
          );
        },
      }),
    );
    await session.prompt(this.initialMessage);
  }

  /** Send a message to the running agent. */
  override async sendMessage(content: string): Promise<void> {
    if (!this.session) {
      throw new Error("Session not started");
    }

    if (this.session.isStreaming) {
      await this.session.steer(content);
    } else {
      await this.session.prompt(content);
    }
  }

  /** Stop the agent session via doStop(). Called by base class stop(). */
  protected override async doStop(): Promise<void> {
    if (!this.session) {
      return;
    }

    this.unsubscribe?.();
    this.session.dispose();
    this.session = null;
    this.unsubscribe = null;
  }

  /** Check if the agent is currently running/streaming. */
  override isRunning(): boolean {
    return this.session?.isStreaming ?? false;
  }
}
