import type { Database, Issue } from "#db";
import type { HookEmitter } from "#lib/hooks";
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
 * const tracker = new Tracker(db, hooks);
 *
 * // Register a parser (typically done by plugins)
 * tracker.registerParser({
 *   source: "jira",
 *   canParse: (input) => /^[A-Z]+-\d+$/.test(input),
 *   parse: async (input) => fetchJiraIssue(input),
 *   memory,
 *   config,
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
  ) {}

  /**
   * Register an issue parser.
   * Parsers are tried in registration order - first match wins.
   */
  registerParser(options: IssueParserOptions): void {
    this.parsers.push(IssueParser.from(options));
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
   * @throws Error if no parser can handle the input
   */
  async parseInput(input: string): Promise<Issue> {
    const trimmed = input.trim();

    // Find matching parser
    const parser = this.parsers.find((p) => p.canParse(trimmed));
    if (!parser) {
      throw new Error(`No parser found for input: "${trimmed}"`);
    }

    // Parse the input
    const parsed = await parser.parse(trimmed);

    // Check for existing issue
    const existing = await this.db.issues.getByExternalId(parsed.externalId, parsed.source);
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
   * Build a prompt for an issue.
   *
   * Delegates to the parser that handles this issue's source.
   *
   * @throws Error if issue not found or no parser for source
   */
  async buildPrompt(issueId: string, options: BuildPromptOptions = {}): Promise<string> {
    // Fetch issue
    const issue = await this.db.issues.getById(issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    // Find parser for this issue's source
    const parser = this.parsers.find((p) => p.source === issue.source);
    if (!parser) {
      throw new Error(`No parser found for source: "${issue.source}"`);
    }

    // Delegate prompt building to the parser
    const prompt = await parser.buildPrompt(issue, options);

    // Emit completion hook
    this.hooks.emit("prompt.built", {
      issueId: issue.id,
      prompt,
    });

    return prompt;
  }
}
