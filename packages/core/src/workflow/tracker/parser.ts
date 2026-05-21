import type { WorkhorseConfig } from "#config";
import type { Issue } from "#db";
import type { MemoryService } from "#services";

import { type BuildPromptOptions, PromptEngineer } from "./engineer.ts";
import type { IssueSource, ParsedIssue } from "./types.ts";

/**
 * Options for registering an IssueParser.
 * Memory and config are injected by Tracker, not provided by plugins.
 */
export interface IssueParserOptions {
  /** Source this parser handles */
  source: IssueSource;
  /** Check if this parser can handle the given input */
  canParse: (input: string) => boolean;
  /** Parse the input into a ParsedIssue */
  parse: (input: string) => Promise<ParsedIssue>;
}

/**
 * Parser for converting user input into issues and building prompts.
 *
 * Handles both parsing input and building prompts, creating a PromptEngineer
 * per-issue when building prompts.
 */
export class IssueParser {
  constructor(
    /** Source this parser handles */
    readonly source: IssueSource,

    /**
     * Check if this parser can handle the given input.
     * Should be fast - just pattern matching, no network calls.
     */
    readonly canParse: (input: string) => boolean,

    /**
     * Parse the input into a ParsedIssue.
     * May make network calls to fetch issue details.
     */
    readonly parse: (input: string) => Promise<ParsedIssue>,

    private readonly memory: MemoryService,
    private readonly config: Readonly<WorkhorseConfig>,
  ) {}

  /**
   * Create an IssueParser from options object.
   * Memory and config are injected by Tracker.
   */
  static from(
    options: IssueParserOptions,
    memory: MemoryService,
    config: Readonly<WorkhorseConfig>,
  ): IssueParser {
    return new IssueParser(options.source, options.canParse, options.parse, memory, config);
  }

  /**
   * Build a prompt for an issue.
   * Creates a per-issue PromptEngineer to build the prompt.
   */
  buildPrompt(issue: Issue, options: BuildPromptOptions = {}): Promise<string> {
    return new PromptEngineer(issue, this.memory, this.config.prompt.custom).buildPrompt(options);
  }
}
