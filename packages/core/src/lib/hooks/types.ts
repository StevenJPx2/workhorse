import type { Issue, IssueStatus, Notification } from "#db";
import type { AgentAdapter, CreateOptions, ResolvedSkill } from "#workflow";
import type { PromptBuildingContext } from "#workflow";

/** Extracted link from issue content (description/comments). */
export interface DiscoveredLink {
  text: string; /** Display text */
  href: string; /** URL href */
  source: "description" | "comment"; /** Source location */
}

/** All known hook events with their payload types. Plugins can register additional hooks via string keys. */
export type HookCallbacks = {
  // Issues
  "issue.parsed": (payload: {
    issue: Issue;
    raw: unknown;
  }) => void | Promise<void>;
  "issue.status_changed": (payload: {
    issue: Issue;
    from: IssueStatus;
    to: IssueStatus;
  }) => void | Promise<void>;
  "issue.deleted": (payload: { issue: Issue }) => void | Promise<void>;
  "issue.links.discovered": (payload: {
    issue: Issue;
    links: DiscoveredLink[];
  }) => void | Promise<void>;

  // Prompts
  "prompt.building": (payload: PromptBuildingContext) => void | Promise<void>;
  "prompt.built": (payload: {
    issueId: string;
    prompt: string;
  }) => void | Promise<void>;

  // Agent lifecycle
  "agent.create.pre": (payload: {
    issue: Issue;
    options: CreateOptions;
  }) => void | Promise<void>;
  "agent.create.post": (payload: {
    adapter: AgentAdapter;
  }) => void | Promise<void>;
  "agent.start.pre": (payload: {
    adapter: AgentAdapter;
  }) => void | Promise<void>;
  "agent.start.post": (payload: {
    adapter: AgentAdapter;
  }) => void | Promise<void>;
  "agent.stop.pre": (payload: {
    adapter: AgentAdapter;
  }) => void | Promise<void>;
  "agent.stop.post": (payload: {
    adapter: AgentAdapter;
  }) => void | Promise<void>;

  // Agent events (bridged from harness session.subscribe())
  "agent.output": (payload: {
    issueId: string;
    delta: string;
  }) => void | Promise<void>;
  "agent.tool_call": (payload: {
    issueId: string;
    tool: string;
    args: unknown;
  }) => void | Promise<void>;
  "agent.crashed": (payload: {
    issueId: string;
    error: Error;
  }) => void | Promise<void>;
  "agent.idle": (payload: {
    issueId: string;
    status: IssueStatus;
    source: string;
  }) => void | Promise<void>;

  // Steering (idle steering system)
  "steering.reminder": (payload: {
    issueId: string;
    reminder: string;
  }) => void | Promise<void>;

  // User interactions
  "user.message": (payload: {
    issueId: string;
    content: string;
  }) => void | Promise<void>;

  // Notifications
  "notification.created": (payload: {
    notification: Notification;
    issueId: string;
  }) => void | Promise<void>;

  // Monitors
  "monitor.registered": (payload: {
    name: string;
    type: "polling" | "event";
  }) => void | Promise<void>;
  "monitor.tick": (payload: {
    id: string;
    issueId: string;
    result: unknown;
  }) => void | Promise<void>;
  "monitor.error": (payload: {
    id: string;
    issueId: string;
    error: Error;
    errorCount: number;
  }) => void | Promise<void>;

  // Plugins
  "plugin.loaded": (payload: { name: string }) => void | Promise<void>;
  "plugin.error": (payload: {
    name: string;
    error: Error;
  }) => void | Promise<void>;

  // Skills
  "skill.registered": (payload: {
    skill: ResolvedSkill;
  }) => void | Promise<void>;

  // Memory indexing
  "memory.indexed": (payload: {
    issueId: string;
    documentCount: number;
    trigger: "idle" | "stop";
  }) => void | Promise<void>;

  // TUI events (registered by workhorse plugin)
  "tui.register_renderer": (payload: {
    id: string;
    renderer: unknown;
    priority?: number;
  }) => void | Promise<void>;
};

/** Extract the payload type from a hook callback. */
export type HookPayload<K extends keyof HookCallbacks> =
  HookCallbacks[K] extends (payload: infer P) => void | Promise<void>
    ? P
    : never;

/**
 * Hook event names - includes known events plus allows arbitrary string keys for plugins.
 */
export type HookEventName = keyof HookCallbacks | (string & {});

/** Legacy type alias for backwards compatibility. Maps hook names to their payload types. */
export type HookEventMap = {
  [K in keyof HookCallbacks]: HookPayload<K>;
};

/** The hook emitter interface exposed to plugins and consumers. Supports known (type-safe) and plugin hooks. */
export interface HookEmitter {
  /** Register a hook handler. Returns unregister function. */
  on<K extends keyof HookCallbacks>(
    name: K,
    handler: HookCallbacks[K],
  ): () => void;
  on(name: string, handler: (payload: any) => void | Promise<void>): () => void;

  /** Fire-and-forget emit - does NOT wait for async handlers. */
  emit<K extends keyof HookCallbacks>(name: K, payload: HookPayload<K>): void;
  emit(name: string, payload: any): void;

  /** Awaitable emit - waits for all handlers (including async) to complete. */
  callHook<K extends keyof HookCallbacks>(
    name: K,
    payload: HookPayload<K>,
  ): Promise<void>;
  callHook(name: string, payload: any): Promise<void>;

  /** Remove a specific handler. */
  off<K extends keyof HookCallbacks>(name: K, handler: HookCallbacks[K]): void;
  off(name: string, handler: (payload: any) => void | Promise<void>): void;

  /** Access to internal handlers map for clearing all hooks. */
  all: {
    clear: () => void;
  };
}
