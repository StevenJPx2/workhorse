/**
 * A block of context to include in the prompt.
 * Plugins contribute these via the `prompt.building` hook.
 */
export interface PromptContextBlock {
  /** Unique identifier (e.g., "jira-context", "pr-state") */
  id: string;
  /** Section heading */
  title: string;
  /** Markdown content */
  content: string;
  /** Sort order (lower = earlier in prompt, default: 0) */
  priority?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context passed to plugins during prompt building.
 * Plugins can push additional context blocks.
 */
export interface PromptBuildingContext {
  issueId: string;
  /** Context blocks - plugins can push to this array */
  contextBlocks: PromptContextBlock[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Source of an issue (e.g., Jira, GitHub, manual).
 * Extensible via `& {}` for plugin-defined sources.
 */
export type IssueSource = "jira" | "github" | "manual" | (string & {});

/**
 * Type of issue (task, bug, story, etc.).
 * Extensible via `& {}` for plugin-defined types.
 */
// fallow-ignore-next-line unused-type
export type IssueType = "task" | "bug" | "story" | "epic" | (string & {});

/**
 * Parsed representation of an issue from external input.
 * This is the intermediate form before database insertion.
 */
export interface ParsedIssue {
  /** External ID (e.g., "AM-123", "octocat/repo#42") */
  externalId: string;
  /** Source system */
  source: IssueSource;
  /** Issue title */
  title: string;
  /** Issue description/body */
  description: string;
  /** Type of issue */
  issueType: IssueType;
  /** URL to the issue in the source system */
  url?: string;
  /** Assigned user */
  assignee?: string;
  /** Labels/tags */
  labels?: string[];
  /** Additional source-specific data */
  metadata: Record<string, unknown>;
}
