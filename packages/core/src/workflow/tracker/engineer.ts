import type { Issue } from "#db";
import type { MemoryService, SearchResult, SessionMemory } from "#services/memory";
import type { JiratownConfig } from "#config";
import type { PromptContextBlock } from "./types.ts";
import {
  renderIssueSection,
  renderContextBlock,
  renderSearchResults,
  sortContextBlocks,
  buildInitialPrompt,
  buildResumePrompt,
} from "./render.ts";

/**
 * Options for building a prompt.
 */
export interface BuildPromptOptions {
  /** Override isResume detection */
  isResume?: boolean;
}

/**
 * PromptEngineer - Builds prompts for issues with memory enrichment.
 *
 * Handles the assembly of system prompts, initial prompts, and resume prompts,
 * enriching them with session memory, semantic search results, and notifications.
 */
export class PromptEngineer {
  private readonly customInstructions?: string;

  constructor(
    /** Memory service for context enrichment */
    private readonly memory: MemoryService,

    /** App configuration */
    config: Readonly<JiratownConfig>,
  ) {
    this.customInstructions = config.prompt.custom;
  }

  /**
   * Build a complete prompt for an issue.
   */
  async buildPrompt(issue: Issue, options: BuildPromptOptions = {}): Promise<string> {
    const { sessionMemory, searchResults, contextBlocks, isResume } = await this.gatherContext(
      issue,
      options,
    );

    const systemPrompt = this.buildSystemPrompt(issue, contextBlocks, searchResults);

    if (isResume) {
      return `${systemPrompt}\n\n${buildResumePrompt(issue, sessionMemory)}`;
    }

    return `${systemPrompt}\n\n${buildInitialPrompt(issue)}`;
  }

  /**
   * Gather context from memory and notifications.
   */
  private async gatherContext(
    issue: Issue,
    options: BuildPromptOptions,
  ): Promise<{
    sessionMemory?: SessionMemory;
    searchResults: SearchResult[];
    contextBlocks: PromptContextBlock[];
    isResume: boolean;
  }> {
    // Check L1 memory (session context)
    let sessionMemory: SessionMemory | undefined;
    let isResume = options.isResume ?? false;

    if (issue.worktreePath) {
      const l1Context = this.memory.l1.get(issue.externalId);
      if (l1Context?.exists()) {
        sessionMemory = (await l1Context.read()) ?? undefined;
        isResume = options.isResume ?? true;
      }
    }

    // Get unread notifications and add as context block
    const notifications = this.memory.notifications.getUnread(issue.id);
    const contextBlocks: PromptContextBlock[] = [];

    if (notifications.length > 0) {
      contextBlocks.push({
        id: "system-inbox",
        title: "Pending Notifications",
        content: this.memory.notifications.generateInbox(notifications),
        priority: -100, // High priority - show early
      });
    }

    return {
      sessionMemory,
      searchResults: await this.searchL2Memory(`${issue.title} ${issue.description}`.trim()),
      contextBlocks,
      isResume,
    };
  }

  /**
   * Build the system prompt (common for both initial and resume).
   */
  private buildSystemPrompt(
    issue: Issue,
    contextBlocks: PromptContextBlock[],
    searchResults: SearchResult[],
  ): string {
    const sections: string[] = [];

    // Issue context
    sections.push(renderIssueSection(issue));

    // Context blocks (sorted by priority, lower first)
    for (const block of sortContextBlocks(contextBlocks)) {
      sections.push(renderContextBlock(block));
    }

    // Search results from L2 memory
    if (searchResults.length > 0) {
      sections.push(renderSearchResults(searchResults));
    }

    // Custom instructions
    if (this.customInstructions) {
      sections.push(`## Custom Instructions\n\n${this.customInstructions}`);
    }

    return sections.join("\n\n");
  }

  /**
   * Search L2 memory for relevant context.
   */
  private async searchL2Memory(query: string): Promise<SearchResult[]> {
    if (!query) return [];
    return this.memory.l2.search(query, { limit: 5, returnContent: true });
  }
}
