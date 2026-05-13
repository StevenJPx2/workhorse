import type { Issue } from "#db";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService, SearchResult, SessionMemory } from "#services/memory";
import type { OrchestratorTool } from "#workflow/orchestrator";
import {
  buildInitialPrompt,
  buildResumePrompt,
  renderContextBlock,
  renderIssueSection,
  renderSearchResults,
  sortContextBlocks,
} from "./render.ts";
import type { PromptBuildingContext, PromptContextBlock } from "./types.ts";

/** Options for building a prompt. */
export interface BuildPromptOptions {
  isResume?: boolean;
}

/** Options for building a hybrid prompt (system + initial message). */
export interface HybridPromptOptions extends BuildPromptOptions {
  tools?: OrchestratorTool[];
}

/** Result from buildHybridPrompt(). Split into system prompt and initial message. */
export interface HybridPrompt {
  systemPrompt: string;
  initialMessage: string;
}

/**
 * PromptEngineer - Builds prompts for a specific issue with memory enrichment.
 *
 * Instantiated per-issue and bound to that issue at construction time.
 */
export class PromptEngineer {
  constructor(
    /** The issue this engineer builds prompts for */
    private readonly issue: Issue,

    /** Memory service for context enrichment */
    private readonly memory: MemoryService,

    /** Custom instructions from config */
    private readonly customInstructions?: string,

    /** Hook emitter for prompt.building event */
    private readonly hooks?: HookEmitter,
  ) {}

  /**
   * Build a complete prompt for the issue.
   */
  async buildPrompt(options: BuildPromptOptions = {}): Promise<string> {
    const { sessionMemory, searchResults, contextBlocks, isResume } =
      await this.gatherContext(options);

    const systemPrompt = this.buildSystemPrompt(contextBlocks, searchResults);

    if (isResume) {
      return `${systemPrompt}\n\n${buildResumePrompt(this.issue, sessionMemory)}`;
    }

    return `${systemPrompt}\n\n${buildInitialPrompt(this.issue)}`;
  }

  /**
   * Build hybrid prompt split into system prompt and initial message.
   */
  async buildHybridPrompt(options: HybridPromptOptions = {}): Promise<HybridPrompt> {
    const { sessionMemory, searchResults, contextBlocks, isResume } =
      await this.gatherContext(options);
    return {
      systemPrompt: this.buildSystemPrompt(contextBlocks, searchResults, options.tools ?? []),
      initialMessage: isResume
        ? buildResumePrompt(this.issue, sessionMemory)
        : buildInitialPrompt(this.issue),
    };
  }

  /**
   * Gather context from memory and notifications.
   */
  private async gatherContext(options: BuildPromptOptions): Promise<{
    sessionMemory?: SessionMemory;
    searchResults: SearchResult[];
    contextBlocks: PromptContextBlock[];
    isResume: boolean;
  }> {
    // Check L1 memory (session context)
    let sessionMemory: SessionMemory | undefined;
    let isResume = options.isResume ?? false;

    if (this.issue.worktreePath) {
      const l1Context = this.memory.l1.get(this.issue.externalId);
      if (l1Context?.exists()) {
        sessionMemory = (await l1Context.read()) ?? undefined;
        isResume = options.isResume ?? true;
      }
    }

    // Get unread notifications and add as context block
    const notifications = await this.memory.notifications.getUnread(this.issue.id);
    const contextBlocks: PromptContextBlock[] = [];

    if (notifications.length > 0) {
      contextBlocks.push({
        id: "system-inbox",
        title: "Pending Notifications",
        content: `**IMPORTANT**: You have pending notifications that require your attention. Review each notification and respond appropriately:
- For comments/questions: Address the question or request directly
- For review feedback: Make the requested changes
- For CI failures: Investigate and fix the issue
- For blocking notifications: Stop current work and address immediately

After addressing a notification, acknowledge it by incorporating its feedback into your work.

${this.memory.notifications.generateInbox(notifications)}`,
        priority: -100, // High priority - show early
      });
    }

    // Emit prompt.building hook to let plugins contribute context blocks
    // Uses internal issue.id (UUID) for consistency with other hooks
    // IMPORTANT: Use callHook (not emit) to await async handlers
    if (this.hooks) {
      await this.hooks.callHook("prompt.building", {
        issueId: this.issue.id,
        contextBlocks,
        metadata: {},
      } satisfies PromptBuildingContext);
    }

    return {
      sessionMemory,
      searchResults: await this.searchL2Memory(
        `${this.issue.title} ${this.issue.description}`.trim(),
      ),
      contextBlocks,
      isResume,
    };
  }

  /** Build system prompt with optional tools section. */
  private buildSystemPrompt(
    contextBlocks: PromptContextBlock[],
    searchResults: SearchResult[],
    tools: OrchestratorTool[] = [],
  ): string {
    const sections: string[] = [renderIssueSection(this.issue)];
    if (tools.length > 0) sections.push(this.renderToolsSection(tools));
    for (const block of sortContextBlocks(contextBlocks)) sections.push(renderContextBlock(block));
    if (searchResults.length > 0) sections.push(renderSearchResults(searchResults));
    if (this.customInstructions)
      sections.push(`## Custom Instructions\n\n${this.customInstructions}`);
    return sections.join("\n\n");
  }

  /** Search L2 memory for relevant context. */
  private async searchL2Memory(query: string): Promise<SearchResult[]> {
    return query ? this.memory.l2.search(query, { limit: 5, returnContent: true }) : [];
  }

  /** Render tools section for system prompt. */
  private renderToolsSection(tools: OrchestratorTool[]): string {
    const lines = [
      "## Workhorse Tools",
      "",
      "The following tools are available for interacting with Workhorse:",
      "",
    ];
    for (const tool of tools) lines.push(`### ${tool.name}`, tool.description, "");
    return lines.join("\n");
  }
}
