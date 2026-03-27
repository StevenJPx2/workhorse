/**
 * Dependency checking for jiratown setup
 */

import { $ } from "bun";

export interface Dependency {
  name: string;
  command: string;
  checkArgs: string[];
  installHint?: string;
}

export const DEPENDENCIES: Dependency[] = [
  {
    name: "Bun",
    command: "bun",
    checkArgs: ["--version"],
  },
  {
    name: "Gas Town (gt)",
    command: "gt",
    checkArgs: ["--version"],
    installHint: "Install from https://github.com/steveyegge/gastown",
  },
  {
    name: "Beads (bd)",
    command: "bd",
    checkArgs: ["--version"],
    installHint: "Install from https://github.com/steveyegge/beads",
  },
];

/**
 * Check if a dependency is available
 */
export async function checkDependency(dep: Dependency): Promise<boolean> {
  try {
    await $`${dep.command} ${dep.checkArgs}`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check all dependencies and return missing ones
 */
export async function checkAllDependencies(): Promise<{
  available: Dependency[];
  missing: Dependency[];
}> {
  const available: Dependency[] = [];
  const missing: Dependency[] = [];

  for (const dep of DEPENDENCIES) {
    const isAvailable = await checkDependency(dep);
    if (isAvailable) {
      available.push(dep);
    } else {
      missing.push(dep);
    }
  }

  return { available, missing };
}
