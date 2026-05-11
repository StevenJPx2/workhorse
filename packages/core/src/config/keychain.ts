import { $ } from "bun";

const SERVICE = "jiratown";

/**
 * Store a credential in the system keychain.
 * Uses macOS Keychain via the `security` command.
 */
export async function storeCredential(service: string, key: string, value: string): Promise<void> {
  // Delete existing entry first (ignore errors if it doesn't exist)
  await $`security delete-generic-password -a ${`${SERVICE}:${service}:${key}`} -s ${SERVICE} 2>/dev/null`.nothrow();

  // Add new entry
  await $`security add-generic-password -a ${`${SERVICE}:${service}:${key}`} -s ${SERVICE} -w ${value}`;
}

/**
 * Retrieve a credential from the system keychain.
 * Returns null if not found.
 */
export async function getCredential(service: string, key: string): Promise<string | null> {
  const result =
    await $`security find-generic-password -a ${`${SERVICE}:${service}:${key}`} -s ${SERVICE} -w 2>/dev/null`.nothrow();

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout.toString().trim() || null;
}

/**
 * Delete a credential from the system keychain.
 */
export async function deleteCredential(service: string, key: string): Promise<void> {
  await $`security delete-generic-password -a ${`${SERVICE}:${service}:${key}`} -s ${SERVICE} 2>/dev/null`.nothrow();
}
