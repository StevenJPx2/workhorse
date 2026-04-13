/**
 * Clipboard utility for reading from system clipboard
 *
 * Provides cross-platform clipboard access using system commands:
 * - macOS: pbpaste
 * - Linux: xclip or xsel
 * - Windows: PowerShell Get-Clipboard
 */

import { spawn } from "child_process";

/**
 * Get the appropriate clipboard command for the current platform
 */
function getClipboardCommand(): { cmd: string; args: string[] } | null {
  switch (process.platform) {
    case "darwin":
      return { cmd: "pbpaste", args: [] };
    case "linux":
      // Try xclip first, fall back to xsel
      return { cmd: "xclip", args: ["-selection", "clipboard", "-o"] };
    case "win32":
      return {
        cmd: "powershell",
        args: ["-command", "Get-Clipboard"],
      };
    default:
      return null;
  }
}

/**
 * Read text from the system clipboard
 *
 * @returns Promise resolving to clipboard contents, or empty string on error
 */
export async function readClipboard(): Promise<string> {
  const command = getClipboardCommand();

  if (!command) {
    return "";
  }

  return new Promise((resolve) => {
    const proc = spawn(command.cmd, command.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errorOccurred = false;

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr.on("data", () => {
      errorOccurred = true;
    });

    proc.on("error", () => {
      // Command not found or failed to execute
      resolve("");
    });

    proc.on("close", (code) => {
      if (code === 0 && !errorOccurred) {
        // Remove trailing newline that pbpaste/xclip adds
        resolve(output.replace(/\r?\n$/, ""));
      } else {
        resolve("");
      }
    });
  });
}

/**
 * Synchronous clipboard read using Bun's spawnSync
 *
 * @returns Clipboard contents, or empty string on error
 */
export function readClipboardSync(): string {
  const command = getClipboardCommand();

  if (!command) {
    return "";
  }

  try {
    const result = Bun.spawnSync([command.cmd, ...command.args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    if (result.exitCode === 0) {
      // Remove trailing newline that clipboard commands add
      return result.stdout.toString().replace(/\r?\n$/, "");
    }
  } catch {
    // Command not found or failed
  }

  return "";
}
