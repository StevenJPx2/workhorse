/**
 * Atlassian MCP Client
 *
 * Manages the connection to Atlassian MCP server via mcp-remote proxy.
 * Handles lifecycle, reconnection, and tool calls.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  JiraIssue,
  GetJiraIssueResponse,
  McpToolResultContent,
} from "./types.ts";

const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

export interface AtlassianClientOptions {
  /** Jira cloud ID (e.g., "yourcompany.atlassian.net") */
  cloudId: string;
}

/**
 * Atlassian MCP client wrapper
 */
export class AtlassianClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private _isConnected = false;
  private cloudId: string;

  constructor(options: AtlassianClientOptions) {
    this.cloudId = options.cloudId;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to the Atlassian MCP server
   */
  async connect(): Promise<void> {
    if (this._isConnected) return;

    // Use shell to redirect mcp-remote logs to /dev/null
    // This prevents debug output from appearing in the terminal UI
    const isWindows = process.platform === "win32";
    this.transport = new StdioClientTransport({
      command: isWindows ? "cmd" : "sh",
      args: isWindows
        ? ["/c", `npx -y mcp-remote ${ATLASSIAN_MCP_URL} 2>nul`]
        : ["-c", `npx -y mcp-remote ${ATLASSIAN_MCP_URL} 2>/dev/null`],
    } as any);

    this.client = new Client({
      name: "jiratown",
      version: "1.0.0",
    });

    await this.client.connect(this.transport);
    this._isConnected = true;
  }

  /**
   * Disconnect from the Atlassian MCP server
   */
  async disconnect(): Promise<void> {
    if (!this._isConnected || !this.client) return;

    await this.client.close();
    this.client = null;
    this.transport = null;
    this._isConnected = false;
  }

  /**
   * Fetch a Jira issue by key
   */
  async fetchIssue(ticketKey: string): Promise<JiraIssue> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name: "getJiraIssue",
      arguments: {
        cloudId: this.cloudId,
        issueIdOrKey: ticketKey,
      },
    });

    const content = result.content as McpToolResultContent[];
    if (!content || content.length === 0) {
      throw new Error(`No data returned for issue ${ticketKey}`);
    }

    const textContent = content.find((c) => c.type === "text");
    if (!textContent) {
      throw new Error(`Unexpected response format for issue ${ticketKey}`);
    }

    // Parse the response, with better error handling
    let data: GetJiraIssueResponse;
    try {
      data = JSON.parse(textContent.text) as GetJiraIssueResponse;
    } catch {
      // Truncate the response for error message (may be very long)
      const preview = textContent.text.slice(0, 200);
      throw new Error(
        `Failed to parse Jira response for ${ticketKey}: ${preview}${textContent.text.length > 200 ? "..." : ""}`
      );
    }
    
    return this.mapIssueResponse(data);
  }

  /**
   * Add a comment to a Jira issue
   */
  async addComment(ticketKey: string, body: string): Promise<void> {
    this.ensureConnected();

    await this.client!.callTool({
      name: "addCommentToJiraIssue",
      arguments: {
        cloudId: this.cloudId,
        issueIdOrKey: ticketKey,
        commentBody: body,
      },
    });
  }

  /**
   * Transition a Jira issue to a new status
   */
  async transitionIssue(
    ticketKey: string,
    transitionId: string
  ): Promise<void> {
    this.ensureConnected();

    await this.client!.callTool({
      name: "transitionJiraIssue",
      arguments: {
        cloudId: this.cloudId,
        issueIdOrKey: ticketKey,
        transition: { id: transitionId },
      },
    });
  }

  private ensureConnected(): void {
    if (!this._isConnected || !this.client) {
      throw new Error("Not connected to Atlassian MCP. Call connect() first.");
    }
  }

  private mapIssueResponse(data: GetJiraIssueResponse): JiraIssue {
    const baseUrl = `https://${this.cloudId}`;
    return {
      key: data.key,
      summary: data.fields.summary,
      description: data.fields.description ?? null,
      status: data.fields.status.name,
      priority: data.fields.priority?.name ?? null,
      assignee: data.fields.assignee?.displayName ?? null,
      reporter: data.fields.reporter?.displayName ?? null,
      issueType: data.fields.issuetype.name,
      url: `${baseUrl}/browse/${data.key}`,
      projectKey: data.fields.project.key,
      created: data.fields.created,
      updated: data.fields.updated,
    };
  }
}

/**
 * Create an Atlassian client instance
 */
export function createAtlassianClient(
  options: AtlassianClientOptions
): AtlassianClient {
  return new AtlassianClient(options);
}
