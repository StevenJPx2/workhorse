/**
 * GitHub Connection - Base class managing the MCP connection lifecycle
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const GITHUB_MCP_URL = "https://mcp.github.com/mcp";

export class GitHubConnection {
  protected client: Client | null = null;
  protected transport: StdioClientTransport | null = null;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    if (this._isConnected) return;

    const isWindows = process.platform === "win32";
    this.transport = new StdioClientTransport({
      command: isWindows ? "cmd" : "sh",
      args: isWindows
        ? ["/c", `npx -y mcp-remote ${GITHUB_MCP_URL} 2>nul`]
        : ["-c", `npx -y mcp-remote ${GITHUB_MCP_URL} 2>/dev/null`],
    } as any);

    this.client = new Client({
      name: "jiratown",
      version: "1.0.0",
    });

    await this.client.connect(this.transport);
    this._isConnected = true;
  }

  async disconnect(): Promise<void> {
    if (!this._isConnected || !this.client) return;

    await this.client.close();
    this.client = null;
    this.transport = null;
    this._isConnected = false;
  }

  protected ensureConnected(): void {
    if (!this._isConnected || !this.client) {
      throw new Error("Not connected to GitHub MCP. Call connect() first.");
    }
  }
}
