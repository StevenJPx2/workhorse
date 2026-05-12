/**
 * Path validation utilities for agent harnesses.
 *
 * Provides functions to validate that file operations stay within allowed directories,
 * preventing agents from reading or writing files outside their designated worktree.
 *
 * @module lib/paths
 */

import { normalize, resolve, relative, isAbsolute } from "node:path";

/**
 * Options for path validation.
 */
export interface PathValidationOptions {
  /** The root directory that all paths must be within */
  rootDir: string;
  /** Additional allowed directories outside the root (e.g., temp directories) */
  additionalAllowedDirs?: string[];
}

/**
 * Result of path validation.
 */
export interface PathValidationResult {
  /** Whether the path is valid (within allowed directories) */
  valid: boolean;
  /** The normalized, absolute path */
  normalizedPath: string;
  /** Error message if invalid */
  error?: string;
}

/**
 * Validates that a path is within the allowed directories.
 *
 * This prevents path traversal attacks and ensures agents can only
 * read/write files within their designated worktree.
 *
 * @param path - The path to validate (can be relative or absolute)
 * @param options - Validation options including root directory
 * @returns Validation result with normalized path or error
 *
 * @example
 * ```typescript
 * const result = validatePath("./src/index.ts", { rootDir: "/worktree/PROJ-123" });
 * if (result.valid) {
 *   // Safe to use result.normalizedPath
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function validatePath(path: string, options: PathValidationOptions): PathValidationResult {
  const { rootDir, additionalAllowedDirs = [] } = options;

  // Normalize the root directory
  const normalizedRoot = normalize(resolve(rootDir));

  // Resolve the path (handles relative paths, .., etc.)
  const normalizedPath = normalize(resolve(normalizedRoot, path));

  // Check if path is within root directory
  const relativePath = relative(normalizedRoot, normalizedPath);
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return { valid: true, normalizedPath };
  }

  // Check additional allowed directories
  for (const allowedDir of additionalAllowedDirs) {
    const normalizedAllowed = normalize(resolve(allowedDir));
    const relativeToAllowed = relative(normalizedAllowed, normalizedPath);
    const isWithinAllowed = !relativeToAllowed.startsWith("..") && !isAbsolute(relativeToAllowed);

    if (isWithinAllowed) {
      return { valid: true, normalizedPath };
    }
  }

  return {
    valid: false,
    normalizedPath,
    error: `Path "${path}" is outside the allowed directory "${rootDir}"`,
  };
}

/**
 * Checks if a path is within the allowed directories.
 *
 * Convenience function that returns a boolean instead of a full result object.
 *
 * @param path - The path to check
 * @param options - Validation options
 * @returns true if the path is within allowed directories
 */
export function isPathAllowed(path: string, options: PathValidationOptions): boolean {
  return validatePath(path, options).valid;
}

/**
 * Asserts that a path is within the allowed directories.
 *
 * Throws an error if the path is not allowed, making it easy to use
 * in tool implementations.
 *
 * @param path - The path to validate
 * @param options - Validation options
 * @returns The normalized, absolute path
 * @throws Error if path is outside allowed directories
 *
 * @example
 * ```typescript
 * // In a tool implementation:
 * const safePath = assertPathAllowed(args.filePath, { rootDir: ctx.worktreePath });
 * await fs.writeFile(safePath, content);
 * ```
 */
export function assertPathAllowed(path: string, options: PathValidationOptions): string {
  const result = validatePath(path, options);
  if (!result.valid) {
    throw new Error(result.error);
  }
  return result.normalizedPath;
}

/**
 * Creates a path validator bound to a specific root directory.
 *
 * Useful for creating a validator once and reusing it for multiple paths.
 *
 * @param options - Validation options
 * @returns Object with bound validation functions
 *
 * @example
 * ```typescript
 * const validator = createPathValidator({ rootDir: ctx.worktreePath });
 *
 * // Later in tool execution:
 * if (validator.isAllowed(filePath)) {
 *   const safePath = validator.assert(filePath);
 *   // ...
 * }
 * ```
 */
export function createPathValidator(options: PathValidationOptions) {
  return {
    validate: (path: string) => validatePath(path, options),
    isAllowed: (path: string) => isPathAllowed(path, options),
    assert: (path: string) => assertPathAllowed(path, options),
    rootDir: options.rootDir,
  };
}

export type PathValidator = ReturnType<typeof createPathValidator>;
