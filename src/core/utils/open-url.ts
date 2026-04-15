/**
 * Cross-platform utility to open URLs in the default browser
 */

import { platform } from "os";

/**
 * Opens a URL in the default system browser
 *
 * @param url - The URL to open
 * @returns Promise that resolves when the browser command is spawned
 */
export async function openUrl(url: string): Promise<void> {
  const os = platform();

  let command: string[];

  switch (os) {
    case "darwin":
      command = ["open", url];
      break;
    case "win32":
      command = ["cmd", "/c", "start", "", url];
      break;
    default:
      // Linux and others - try xdg-open
      command = ["xdg-open", url];
  }

  const proc = Bun.spawn(command, {
    stdout: "ignore",
    stderr: "ignore",
  });

  // Don't wait for process to complete - browser may stay open
  // Just wait a tick to ensure it started
  await proc.exited;
}
