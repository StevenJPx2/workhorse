/** Pi Coding Agent adapter. Uses @mariozechner/pi-coding-agent SDK directly. */

import type { AgentState } from "@jiratown/core";

import { AgentAdapter } from "@jiratown/core";
import {
  type AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry as PiModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { createExtensionFromTools, handleSessionEvent } from "./events.ts";
import { PiAdapterModelRegistry } from "./registry.ts";

/** Pi Coding Agent adapter. Extends AgentAdapter to wrap the pi SDK session. */
export class PiAgentAdapter extends AgentAdapter {
  override readonly harness = "pi-coding-agent";
  static override readonly displayName = "Pi Coding Agent";
  static override readonly icon = "🥧";

  /** The model registry for the Pi adapter. */
  static override registry = PiAdapterModelRegistry.getInstance();

  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Start the agent session via doStart(). Called by base class start(). */
  protected override async doStart(): Promise<void> {
    if (this.session) {
      throw new Error("Session already started");
    }

    // Reuse Pi's auth storage (~/.pi/agent/auth.json) for OAuth credentials
    // Users can run `pi /login` to authenticate before using jiratown
    const authStorage = AuthStorage.create();
    const modelRegistry = PiModelRegistry.create(authStorage);

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
      authStorage,
      modelRegistry,
      model: this.model ? this.resolveModel(modelRegistry) : undefined,
    });

    this.session = session;
    this.unsubscribe = session.subscribe((event: AgentSessionEvent) =>
      handleSessionEvent(event, {
        issueId: this.issueId,
        worktreePath: this.worktreePath,
        hooks: this.hooks,
        memory: this.memory,
        source: this.issue.source,
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

  override async sendMessage(content: string): Promise<void> {
    if (!this.session) throw new Error("Session not started");
    if (this.session.isStreaming) await this.session.steer(content);
    else await this.session.prompt(content);
  }

  protected override async doStop(): Promise<void> {
    if (!this.session) return;
    this.unsubscribe?.();
    this.session.dispose();
    this.session = null;
    this.unsubscribe = null;
  }

  override isRunning(): boolean {
    return this.session?.isStreaming ?? false;
  }

  /** Resolve model string ("provider/model-id" or just "model-id") to a Model object. */
  private resolveModel(modelRegistry: PiModelRegistry) {
    if (!this.model) return undefined;
    const slashIndex = this.model.indexOf("/");
    if (slashIndex > 0) {
      const [provider, modelId] = [
        this.model.slice(0, slashIndex),
        this.model.slice(slashIndex + 1),
      ];
      const model = modelRegistry.find(provider, modelId);
      if (!model) throw new Error(`Model "${modelId}" not found for provider "${provider}".`);
      return model;
    }
    const matches = modelRegistry
      .getAll()
      .filter((m) => m.id === this.model || m.id.includes(this.model!));
    if (matches.length === 0) throw new Error(`Model "${this.model}" not found.`);
    if (matches.length > 1) {
      throw new Error(
        `Model "${this.model}" is ambiguous. Found: ${matches.map((m) => `${m.provider}/${m.id}`).join(", ")}`,
      );
    }
    return matches[0];
  }
}
