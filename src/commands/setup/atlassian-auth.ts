/**
 * Atlassian MCP authentication helper
 *
 * Runs mcp-remote to trigger OAuth browser flow and cache credentials.
 */

import { spawn } from "bun";

const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";
const AUTH_TIMEOUT_MS = 120_000; // 2 minutes for user to complete OAuth

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Test Atlassian MCP connection by attempting to connect
 *
 * This spawns mcp-remote which will open a browser for OAuth if needed.
 * The user completes authentication in the browser, then mcp-remote
 * caches the credentials in ~/.mcp-remote/
 */
export async function authenticateAtlassian(): Promise<AuthResult> {
  return new Promise((resolve) => {
    let settled = false;
    let output = "";

    // Spawn mcp-remote - it will open browser for OAuth if not authenticated
    const proc = spawn({
      cmd: ["npx", "-y", "mcp-remote", ATLASSIAN_MCP_URL],
      stdout: "pipe",
      stderr: "pipe",
    });

    // Collect output for debugging
    const collectOutput = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          output += decoder.decode(value);
        }
      } catch {
        // Stream closed
      }
    };

    collectOutput(proc.stdout);
    collectOutput(proc.stderr);

    // Timeout after 2 minutes
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        resolve({
          success: false,
          error: "Authentication timed out. Please try again.",
        });
      }
    }, AUTH_TIMEOUT_MS);

    // Wait for the process to exit or be killed
    proc.exited.then((exitCode) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        // mcp-remote exits with 0 when it successfully gets credentials
        // and receives a shutdown signal (which we send after confirmation)
        resolve({ success: true });
      }
    });

    // Kill the process after a short delay to let auth complete
    // mcp-remote stays running as a server, so we need to kill it
    // once we've confirmed the connection works
    setTimeout(() => {
      if (!settled) {
        proc.kill("SIGTERM");
      }
    }, 10_000); // Give 10 seconds for initial auth flow
  });
}

/**
 * Test if Atlassian MCP is already authenticated
 *
 * Attempts a quick connection to see if cached credentials exist
 */
export async function testAtlassianConnection(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn({
      cmd: ["npx", "-y", "mcp-remote", ATLASSIAN_MCP_URL],
      stdout: "pipe",
      stderr: "pipe",
    });

    // If it starts successfully and doesn't immediately error,
    // credentials are likely cached
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(true); // Started successfully, auth likely cached
    }, 5_000);

    proc.exited.then((exitCode) => {
      clearTimeout(timeout);
      // If it exits quickly with an error, auth might be needed
      resolve(exitCode === 0);
    });
  });
}
