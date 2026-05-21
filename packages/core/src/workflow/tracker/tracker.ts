import type { WorkhorseConfig } from "#config";
import type { Database, Issue } from "#db";
import { removeWorktree } from "#lib";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";

import type { BuildPromptOptions } from "./engineer.ts";
import { IssueParser, type IssueParserOptions } from "./parser.ts";

/**
 * Tracker - Entry point for parsing user input into issues and building prompts.
 *
 * Manages issue parsers (provided by plugins) and coordinates prompt building
 * with memory enrichment.
 *
 * @example
 * ```typescript
 * const tracker = new Tracker(db, hooks, memory, config);
 *
 * // Register a parser (typically done by plugins)
 * tracker.registerParser({
 *   source: "jira",
 *   canParse: (input) => /^[A-Z]+-\d+$/.test(input),
 *   parse: async (input) => fetchJiraIssue(input),
 * });
 *
 * // Parse user input
 * const issue = await tracker.parseInput("AM-123");
 *
 * // Build prompt for the issue
 * const prompt = await tracker.buildPrompt(issue.id);
 * ```
 */
export class Tracker {
  private readonly parsers: IssueParser[] = [];

  constructor(
    private readonly db: Database,
    private readonly hooks: HookEmitter,
    private readonly memory: MemoryService,
    private readonly config: Readonly<WorkhorseConfig>,
  ) {}

  /**
   * Register an issue parser.
   * Parsers are tried in registration order - first match wins.
   */
  registerParser(options: IssueParserOptions): void {
    this.parsers.push(IssueParser.from(options, this.memory, this.config));
  }

  /**
   * Get all registered parsers.
   */
  getParsers(): readonly IssueParser[] {
    return this.parsers;
  }

  /**
   * Parse user input into an Issue.
   *
   * Flow:
   * 1. Try each parser's canParse() until one matches
   * 2. Call the matching parser's parse() to get ParsedIssue
   * 3. Check if issue already exists in DB (by externalId + source)
   * 4. Insert or return existing issue
   * 5. Emit "issue.parsed" hook
   *
   * @param input - User input to parse
   * @param options - Optional parsing options (e.g., repository context)
   * @throws Error if no parser can handle the input
   */
  async parseInput(
    input: string,
    options?: { repository?: string },
  ): Promise<Issue> {
    const trimmed = input.trim();

    // Find matching parser
    const parser = this.parsers.find((p) => p.canParse(trimmed));
    if (!parser) {
      throw new Error(`No parser found for input: "${trimmed}"`);
    }

    // Parse the input
    const parsed = await parser.parse(trimmed);

    // Apply repository context if provided and not already set by parser
    if (options?.repository && !parsed.repository) {
      parsed.repository = options.repository;
    }

    // Check for existing issue
    const existing = await this.db.issues.getByExternalId(
      parsed.externalId,
      parsed.source,
    );
    if (existing) {
      this.hooks.emit("issue.parsed", { issue: existing, raw: parsed });
      return existing;
    }

    // Insert new issue
    const issue = await this.db.issues.insert({
      ...parsed,
      status: "pending",
    });

    this.hooks.emit("issue.parsed", { issue, raw: parsed });
    return issue;
  }

  /**
   * Fetch all issues in the backlog (pending status, not assigned to an agent).
   *
   * @returns Array of issues in pending status
   */
  async fetchBacklog(): Promise<Issue[]> {
    return this.db.issues.getByStatus("pending");
  }

  /**
   * Fetch all issues regardless of status.
   *
   * @returns Array of all issues
   */
  async fetchAll(): Promise<Issue[]> {
    return this.db.issues.getAll();
  }

  /**
   * Fetch issues by repository identifier.
   *
   * @param repository - Repository identifier (e.g., "owner/repo" for GitHub, "PROJ" for Jira)
   * @returns Array of issues for the specified repository
   */
  async fetchByRepository(repository: string): Promise<Issue[]> {
    return this.db.issues.getByRepository(repository);
  }

  /**
   * Delete an issue from the database.
   *
   * Also cleans up:
   * - Related notifications and events
   * - Git worktree and branch (if issue has worktreePath)
   *
   * @param issueId - The internal ID of the issue to delete
   * @emits issue.deleted - After successful deletion
   */
  async deleteIssue(issueId: string): Promise<void> {
    const issue = await this.db.issues.getById(issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    // Clean up related data first (foreign key constraints)
    await this.db.notifications.deleteByIssueId(issueId);
    await this.db.events.deleteByIssueId(issueId);

    // Clean up worktree and branch if they exist
    if (issue.worktreePath) {
      // Derive repo path from worktree path:
      // worktreePath: /path/to/repo-worktrees/ISSUE-123
      // repoPath: /path/to/repo
      await removeWorktree(
        issue.worktreePath.replace(/\/[^/]+$/, "").replace(/-worktrees$/, ""),
        issue.externalId,
        true,
      );
    }

    await this.db.issues.delete(issueId);
    this.hooks.emit("issue.deleted", { issue });
  }

  /** Build a prompt for an issue. Delegates to the parser for this issue's source. */
  async buildPrompt(
    issueId: string,
    options: BuildPromptOptions = {},
  ): Promise<string> {
    const issue = await this.db.issues.getById(issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);

    const parser = this.parsers.find((p) => p.source === issue.source);
    if (!parser)
      throw new Error(`No parser found for source: "${issue.source}"`);

    const prompt = await parser.buildPrompt(issue, options);
    this.hooks.emit("prompt.built", { issueId: issue.id, prompt });
    return prompt;
  }
}
