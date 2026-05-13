import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVICE = "workhorse";

/**
 * Execute the macOS security command.
 * Returns { stdout, exitCode } - never throws for non-zero exit codes.
 */
async function security(...args: string[]): Promise<{ stdout: string; exitCode: number }> {
  try {
    const { stdout } = await execFileAsync("security", args);
    return { stdout, exitCode: 0 };
  } catch (error) {
    // execFile throws on non-zero exit codes
    const execError = error as { code?: number; stdout?: string };
    return {
      stdout: execError.stdout ?? "",
      exitCode: execError.code ?? 1,
    };
  }
}

/**
 * Store a credential in the system keychain.
 * Uses macOS Keychain via the `security` command.
 */
export async function storeCredential(service: string, key: string, value: string): Promise<void> {
  const account = `${SERVICE}:${service}:${key}`;

  // Delete existing entry first (ignore errors if it doesn't exist)
  await security("delete-generic-password", "-a", account, "-s", SERVICE);

  // Add new entry
  const result = await security("add-generic-password", "-a", account, "-s", SERVICE, "-w", value);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to store credential: ${result.stdout}`);
  }
}

/**
 * Retrieve a credential from the system keychain.
 * Returns null if not found.
 */
export async function getCredential(service: string, key: string): Promise<string | null> {
  const result = await security(
    "find-generic-password",
    "-a",
    `${SERVICE}:${service}:${key}`,
    "-s",
    SERVICE,
    "-w",
  );

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

/**
 * Delete a credential from the system keychain.
 */
export async function deleteCredential(service: string, key: string): Promise<void> {
  await security("delete-generic-password", "-a", `${SERVICE}:${service}:${key}`, "-s", SERVICE);
}
