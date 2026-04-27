import type { JiratownConfig } from "#config";
import type { Issue } from "#db";
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
import type { PromptContextBlock } from "./types.ts";

/** Options for building a prompt. */
export interface BuildPromptOptions {
  isResume?: boolean;
}

/** Options for building a hybrid prompt (system + initial message). */
// fallow-ignore-next-line unused-type
export interface HybridPromptOptions extends BuildPromptOptions {
  tools?: OrchestratorTool[];
}

/** Result from buildHybridPrompt(). Split into system prompt and initial message. */
// fallow-ignore-next-line unused-type
export interface HybridPrompt {
  systemPrompt: string;
  initialMessage: string;
}

/** PromptEngineer - Builds prompts for issues with memory enrichment. */
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

  /** Build system prompt with optional tools section. */
  private buildSystemPrompt(
    issue: Issue,
    contextBlocks: PromptContextBlock[],
    searchResults: SearchResult[],
    tools: OrchestratorTool[] = [],
  ): string {
    const sections: string[] = [renderIssueSection(issue)];
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

  /** Build hybrid prompt split into system prompt and initial message for pi-coding-agent. */
  async buildHybridPrompt(issue: Issue, options: HybridPromptOptions = {}): Promise<HybridPrompt> {
    const { sessionMemory, searchResults, contextBlocks, isResume } = await this.gatherContext(
      issue,
      options,
    );
    return {
      systemPrompt: this.buildSystemPrompt(
        issue,
        contextBlocks,
        searchResults,
        options.tools ?? [],
      ),
      initialMessage: isResume
        ? buildResumePrompt(issue, sessionMemory)
        : buildInitialPrompt(issue),
    };
  }

  /** Render tools section for system prompt. */
  private renderToolsSection(tools: OrchestratorTool[]): string {
    const lines = [
      "## Jiratown Tools",
      "",
      "The following tools are available for interacting with Jiratown:",
      "",
    ];
    for (const tool of tools) lines.push(`### ${tool.name}`, tool.description, "");
    return lines.join("\n");
  }
}
