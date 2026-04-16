/**
 * Atlassian MCP Client - Manages the connection to Atlassian MCP server
 *
 * This is core business logic with no UI dependencies.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  JiraIssue,
  McpToolResultContent,
  AtlassianClientOptions,
  JiraClient,
  GetJiraIssueResponse,
} from "./types.ts";
import { mapIssueResponse } from "./map-issue.ts";

// Type for parsed Jira response
interface JiraResponse {
  fields?: Record<string, unknown>;
  key?: string;
  self?: string;
}

const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

/**
 * Atlassian MCP client wrapper
 *
 * Implements the JiraClient interface for dependency injection
 */
export class AtlassianClient implements JiraClient {
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
    let data: JiraResponse;
    try {
      data = JSON.parse(textContent.text) as JiraResponse;
    } catch {
      // Truncate the response for error message (may be very long)
      const preview = textContent.text.slice(0, 200);
      throw new Error(
        `Failed to parse Jira response for ${ticketKey}: ${preview}${textContent.text.length > 200 ? "..." : ""}`,
      );
    }

    // Validate the response has expected fields structure
    if (!data.fields || typeof data.fields !== "object") {
      // Check if it's a Jira error response - extract any error details
      const typedData = data as {
        errorMessages?: string[];
        errors?: Record<string, string>;
        error?: boolean;
        message?: string;
      };

      const errorMessage = typedData.errorMessages?.[0] || typedData.message || "Unknown error";

      // Full response for debugging (not truncated)
      const fullResponse =
        textContent.text.length > 1000
          ? textContent.text.slice(0, 1000) +
            "\n... [truncated at 1000 chars, total: " +
            textContent.text.length +
            "]"
          : textContent.text;

      // Provide helpful guidance for common errors
      let userMessage = `Jira API error: ${errorMessage}`;

      if (errorMessage.includes("isn't explicitly granted by the user")) {
        userMessage = `Authentication required: ${errorMessage}\n\nRun: npx -y mcp-remote https://mcp.atlassian.com/v1/mcp\nThen authorize access in your browser, then try again.`;
      } else if (errorMessage.includes("Issue does not exist")) {
        userMessage = `Ticket not found: ${errorMessage}`;
      }

      throw new Error(`${userMessage}\n\nResponse:\n${fullResponse}`);
    }

    return mapIssueResponse(data as unknown as GetJiraIssueResponse, this.cloudId);
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
  async transitionIssue(ticketKey: string, transitionId: string): Promise<void> {
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

  /**
   * Get the current authenticated user's account ID
   */
  async getCurrentUser(): Promise<{ accountId: string; displayName: string }> {
    this.ensureConnected();

    const result = await this.client!.callTool({
      name: "atlassianUserInfo",
      arguments: {},
    });

    const content = result.content as McpToolResultContent[];
    if (!content || content.length === 0) {
      throw new Error("No data returned for current user");
    }

    const textContent = content.find((c) => c.type === "text");
    if (!textContent) {
      throw new Error("Unexpected response format for user info");
    }

    let data: { accountId?: string; account_id?: string; displayName?: string; name?: string };
    try {
      data = JSON.parse(textContent.text);
    } catch {
      throw new Error(`Failed to parse user info response: ${textContent.text.slice(0, 200)}`);
    }

    const accountId = data.accountId || data.account_id;
    const displayName = data.displayName || data.name || "Unknown";

    if (!accountId) {
      throw new Error(`User account ID not found in response: ${textContent.text.slice(0, 200)}`);
    }

    return { accountId, displayName };
  }

  /**
   * Edit a Jira issue (update fields like assignee)
   */
  async editIssue(ticketKey: string, fields: Record<string, unknown>): Promise<void> {
    this.ensureConnected();

    await this.client!.callTool({
      name: "editJiraIssue",
      arguments: {
        cloudId: this.cloudId,
        issueIdOrKey: ticketKey,
        fields,
      },
    });
  }

  /**
   * Assign a Jira issue to a user
   */
  async assignIssue(ticketKey: string, accountId: string): Promise<void> {
    await this.editIssue(ticketKey, {
      assignee: { accountId },
    });
  }

  private ensureConnected(): void {
    if (!this._isConnected || !this.client) {
      throw new Error("Not connected to Atlassian MCP. Call connect() first.");
    }
  }
}

/**
 * Create an Atlassian client instance
 */
export function createAtlassianClient(options: AtlassianClientOptions): AtlassianClient {
  return new AtlassianClient(options);
}
