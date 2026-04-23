import type { JiratownConfig } from "#config";
import type { Issue } from "#db";
import type { MemoryService } from "#services/memory";
import { type BuildPromptOptions, PromptEngineer } from "./engineer.ts";
import type { IssueSource, ParsedIssue } from "./types.ts";

/**
 * Options for registering an IssueParser.
 */
export interface IssueParserOptions {
  /** Source this parser handles */
  source: IssueSource;
  /** Check if this parser can handle the given input */
  canParse: (input: string) => boolean;
  /** Parse the input into a ParsedIssue */
  parse: (input: string) => Promise<ParsedIssue>;
  /** Memory service for context enrichment */
  memory: MemoryService;
  /** App configuration */
  config: Readonly<JiratownConfig>;
}

/**
 * Parser for converting user input into issues and building prompts.
 *
 * Handles both parsing input and building prompts, containing the PromptEngineer
 * internally.
 */
export class IssueParser {
  private readonly engineer: PromptEngineer;

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

    memory: MemoryService,
    config: Readonly<JiratownConfig>,
  ) {
    this.engineer = new PromptEngineer(memory, config);
  }

  /**
   * Create an IssueParser from options object.
   */
  static from(options: IssueParserOptions): IssueParser {
    return new IssueParser(
      options.source,
      options.canParse,
      options.parse,
      options.memory,
      options.config,
    );
  }

  /**
   * Build a prompt for an issue.
   */
  buildPrompt(issue: Issue, options: BuildPromptOptions = {}): Promise<string> {
    return this.engineer.buildPrompt(issue, options);
  }
}
