/**
 * Jina CLI wrapper for web operations.
 *
 * Wraps the jina-cli Python package which provides:
 * - jina read URL - Extract markdown from web pages
 * - jina search QUERY - Web search with content
 * - jina embed TEXT - Generate embeddings
 * - jina rerank QUERY - Rerank documents
 * - jina screenshot URL - Capture screenshots
 *
 * @see https://github.com/jina-ai/cli
 * @module workhorse-plugin-web/client
 */

import { spawn } from "node:child_process";

/** Result from executing a jina command */
export interface JinaResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Execute a jina CLI command */
export async function execJina(
  args: string[],
  options?: { timeout?: number },
): Promise<JinaResult> {
  const timeout = options?.timeout ?? 60_000;

  return new Promise((resolve) => {
    const proc = spawn("jina", args, {
      timeout,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        stdout: "",
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

/** Check if jina CLI is installed and accessible */
export async function checkJinaInstalled(): Promise<boolean> {
  const result = await execJina(["--version"], { timeout: 5000 });
  return result.success;
}

/** Check if JINA_API_KEY is set */
export function hasApiKey(): boolean {
  return !!process.env.JINA_API_KEY;
}
