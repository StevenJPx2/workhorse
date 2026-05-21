/**
 * Path restriction utilities for Pi SDK tools.
 *
 * Wraps Pi SDK tool operations with path validation from workhorse-core
 * to ensure agents cannot read or write files outside their worktree.
 *
 * ## Standard for Agent Harnesses
 *
 * All agent harnesses/adapters MUST implement path restrictions to ensure:
 * 1. Write operations only create/modify files within the worktree
 * 2. Read operations only access files within the worktree
 * 3. Edit operations only modify files within the worktree
 *
 * This prevents agents from:
 * - Reading sensitive files (e.g., ~/.ssh/*, /etc/passwd)
 * - Writing to system directories
 * - Modifying files in other worktrees or the main repository
 *
 * @module workhorse-plugin-pi-adapter/path-restriction
 */
import type {
  EditOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";
import { constants } from "node:fs";
import {
  access as fsAccess,
  mkdir as fsMkdir,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { type PathValidationOptions, assertPathAllowed } from "workhorse-core";

/**
 * Creates write operations that validate paths before writing.
 *
 * @param options - Path validation options (rootDir = worktreePath)
 * @returns WriteOperations that enforce path restrictions
 *
 * @example
 * ```typescript
 * const writeOps = createRestrictedWriteOperations({ rootDir: worktreePath });
 * const writeTool = createWriteTool(worktreePath, { operations: writeOps });
 * ```
 */
export function createRestrictedWriteOperations(
  options: PathValidationOptions,
): WriteOperations {
  return {
    writeFile: async (absolutePath: string, content: string) => {
      assertPathAllowed(absolutePath, options);
      await fsWriteFile(absolutePath, content, "utf-8");
    },
    mkdir: async (dir: string) => {
      assertPathAllowed(dir, options);
      await fsMkdir(dir, { recursive: true });
    },
  };
}

/**
 * Creates read operations that validate paths before reading.
 *
 * @param options - Path validation options (rootDir = worktreePath)
 * @returns ReadOperations that enforce path restrictions
 *
 * @example
 * ```typescript
 * const readOps = createRestrictedReadOperations({ rootDir: worktreePath });
 * const readTool = createReadTool(worktreePath, { operations: readOps });
 * ```
 */
export function createRestrictedReadOperations(
  options: PathValidationOptions,
): ReadOperations {
  return {
    readFile: async (absolutePath: string) => {
      assertPathAllowed(absolutePath, options);
      return fsReadFile(absolutePath); // Returns Buffer
    },
    access: async (absolutePath: string) => {
      assertPathAllowed(absolutePath, options);
      await fsAccess(absolutePath, constants.R_OK);
    },
  };
}

/**
 * Creates edit operations that validate paths before editing.
 *
 * @param options - Path validation options (rootDir = worktreePath)
 * @returns EditOperations that enforce path restrictions
 *
 * @example
 * ```typescript
 * const editOps = createRestrictedEditOperations({ rootDir: worktreePath });
 * const editTool = createEditTool(worktreePath, { operations: editOps });
 * ```
 */
export function createRestrictedEditOperations(
  options: PathValidationOptions,
): EditOperations {
  return {
    readFile: async (absolutePath: string) => {
      assertPathAllowed(absolutePath, options);
      return fsReadFile(absolutePath); // Returns Buffer
    },
    writeFile: async (absolutePath: string, content: string) => {
      assertPathAllowed(absolutePath, options);
      await fsWriteFile(absolutePath, content, "utf-8");
    },
    access: async (absolutePath: string) => {
      assertPathAllowed(absolutePath, options);
      await fsAccess(absolutePath, constants.R_OK | constants.W_OK);
    },
  };
}

/**
 * Configuration for all restricted tool operations.
 */
export interface RestrictedToolOperations {
  write: WriteOperations;
  read: ReadOperations;
  edit: EditOperations;
}

/**
 * Creates all restricted operations at once.
 *
 * @param options - Path validation options (rootDir = worktreePath)
 * @returns All restricted operations for write, read, and edit tools
 *
 * @example
 * ```typescript
 * const ops = createAllRestrictedOperations({ rootDir: worktreePath });
 * // Use ops.write, ops.read, ops.edit with respective tools
 * ```
 */
export function createAllRestrictedOperations(
  options: PathValidationOptions,
): RestrictedToolOperations {
  return {
    write: createRestrictedWriteOperations(options),
    read: createRestrictedReadOperations(options),
    edit: createRestrictedEditOperations(options),
  };
}
