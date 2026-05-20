/**
 * Bash tool path restriction utilities for Pi SDK.
 * Ensures agents cannot execute commands outside their worktree or /tmp/.
 * @module workhorse-plugin-pi-adapter/bash-restriction
 */

import { tmpdir } from "node:os";
import { resolve, normalize } from "node:path";

import {
  createLocalBashOperations,
  type BashOperations,
  type BashSpawnHook,
} from "@earendil-works/pi-coding-agent";
import { assertPathAllowed, isPathAllowed, type PathValidationOptions } from "workhorse-core";

/** Options for creating restricted bash operations. */
export interface RestrictedBashOptions extends PathValidationOptions {
  /** Allow commands in /tmp/. Default: true */
  allowTmp?: boolean;
  /** Custom shell path for command execution. */
  shellPath?: string;
  /** Additional environment variables to merge with the shell environment. */
  additionalEnv?: NodeJS.ProcessEnv;
}

/**
 * Default environment variables to prevent interactive prompts that brick the agent.
 * - GIT_EDITOR=true: Prevents git from opening an editor for commit messages
 * - GIT_SEQUENCE_EDITOR=true: Prevents git from opening an editor for interactive rebase
 * - GIT_PAGER=cat: Prevents git from using a pager that waits for input
 */
const NON_INTERACTIVE_ENV: NodeJS.ProcessEnv = {
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_PAGER: "cat",
};

const DEFAULT_TMP_DIR = tmpdir();

/** Default timeout for bash commands (5 minutes in milliseconds). */
const DEFAULT_BASH_TIMEOUT_MS = 5 * 60 * 1000;

/** Creates a spawn hook that validates cwd before command execution. */
export function createPathValidatingSpawnHook(options: RestrictedBashOptions): BashSpawnHook {
  const { rootDir, allowTmp = true, additionalEnv } = options;

  // Build the list of allowed directories
  const additionalAllowedDirs = [...(options.additionalAllowedDirs ?? [])];
  if (allowTmp && !additionalAllowedDirs.includes(DEFAULT_TMP_DIR)) {
    additionalAllowedDirs.push(DEFAULT_TMP_DIR);
  }

  const pathOptions: PathValidationOptions = {
    rootDir,
    additionalAllowedDirs,
  };

  return (context) => {
    const normalizedCwd = normalize(resolve(context.cwd));
    if (!isPathAllowed(normalizedCwd, pathOptions)) {
      throw new Error(
        `Working directory "${context.cwd}" is outside allowed paths. ` +
          `Commands can only run in "${rootDir}" or /tmp/.`,
      );
    }
    return {
      ...context,
      cwd: normalizedCwd,
      env: additionalEnv ? { ...context.env, ...additionalEnv } : context.env,
    };
  };
}

/** Creates bash operations that validate paths before execution. */
export function createRestrictedBashOperations(options: RestrictedBashOptions): BashOperations {
  const { rootDir, allowTmp = true, shellPath } = options;

  // Build the list of allowed directories
  const additionalAllowedDirs = [...(options.additionalAllowedDirs ?? [])];
  if (allowTmp && !additionalAllowedDirs.includes(DEFAULT_TMP_DIR)) {
    additionalAllowedDirs.push(DEFAULT_TMP_DIR);
  }

  const pathOptions: PathValidationOptions = {
    rootDir,
    additionalAllowedDirs,
  };

  // Get the base local operations
  const localOps = createLocalBashOperations({ shellPath });

  return {
    exec: async (command, cwd, execOptions) => {
      // assertPathAllowed throws if cwd is outside allowed directories
      // Apply default 5-minute timeout unless explicitly overridden
      // Inject NON_INTERACTIVE_ENV to prevent git/other tools from opening editors
      return localOps.exec(command, assertPathAllowed(cwd, pathOptions), {
        ...execOptions,
        timeout: execOptions.timeout ?? DEFAULT_BASH_TIMEOUT_MS,
        env: { ...NON_INTERACTIVE_ENV, ...execOptions.env },
      });
    },
  };
}

/** Configuration for bash tool with path restrictions. */
export interface RestrictedBashToolConfig {
  /** The worktree root directory (all paths must be within this). */
  worktreePath: string;
  /** Allow commands in /tmp/. Default: true */
  allowTmp?: boolean;
  /** Additional directories to allow (beyond worktree and /tmp/). */
  additionalAllowedDirs?: string[];
  /** Custom shell path for command execution. */
  shellPath?: string;
}

/** Creates all bash-related restricted configurations (operations + spawnHook). */
export function createRestrictedBashConfig(config: RestrictedBashToolConfig): {
  operations: BashOperations;
  spawnHook: BashSpawnHook;
  pathOptions: PathValidationOptions;
} {
  const { worktreePath, allowTmp = true, additionalAllowedDirs = [], shellPath } = config;

  // Build the list of allowed directories
  const allAllowedDirs = [...additionalAllowedDirs];
  if (allowTmp && !allAllowedDirs.includes(DEFAULT_TMP_DIR)) {
    allAllowedDirs.push(DEFAULT_TMP_DIR);
  }

  const pathOptions: PathValidationOptions = {
    rootDir: worktreePath,
    additionalAllowedDirs: allAllowedDirs,
  };

  const restrictedOptions: RestrictedBashOptions = {
    ...pathOptions,
    allowTmp,
    shellPath,
  };

  return {
    operations: createRestrictedBashOperations(restrictedOptions),
    spawnHook: createPathValidatingSpawnHook(restrictedOptions),
    pathOptions,
  };
}
