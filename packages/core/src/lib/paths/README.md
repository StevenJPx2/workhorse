# Path Validation

Path validation utilities for agent harnesses to ensure file operations stay within allowed directories.

## Standard for Agent Harnesses

**All agent harnesses/adapters MUST implement path restrictions** to ensure:

1. **Write operations** only create/modify files within the worktree
2. **Read operations** only access files within the worktree
3. **Edit operations** only modify files within the worktree

This prevents agents from:

- Reading sensitive files (e.g., `~/.ssh/*`, `/etc/passwd`, credentials)
- Writing to system directories
- Modifying files in other worktrees or the main repository
- Escaping the sandbox via path traversal (e.g., `../../etc/passwd`)

## Usage

### Basic Validation

```typescript
import { validatePath, isPathAllowed, assertPathAllowed } from "workhorse-core";

const options = { rootDir: "/path/to/worktree" };

// Check if path is valid
const result = validatePath("./src/index.ts", options);
if (result.valid) {
  console.log("Safe path:", result.normalizedPath);
} else {
  console.error(result.error);
}

// Boolean check
if (isPathAllowed("../../../etc/passwd", options)) {
  // This won't execute - path is outside worktree
}

// Assert and get normalized path (throws on invalid)
const safePath = assertPathAllowed("./src/index.ts", options);
await fs.writeFile(safePath, content);
```

### Path Validator Factory

```typescript
import { createPathValidator } from "workhorse-core";

// Create a validator bound to the worktree
const validator = createPathValidator({ rootDir: ctx.worktreePath });

// Use throughout tool execution
if (validator.isAllowed(filePath)) {
  const safePath = validator.assert(filePath);
  // ... safe to use
}
```

### Additional Allowed Directories

Some tools may need access to directories outside the worktree (e.g., temp directories):

```typescript
import { validatePath } from "workhorse-core";

const options = {
  rootDir: "/path/to/worktree",
  additionalAllowedDirs: ["/tmp/workhorse-cache"],
};

// Now paths in /tmp/workhorse-cache are also allowed
validatePath("/tmp/workhorse-cache/data.json", options); // valid: true
```

## Implementing in Adapters

### Pi Adapter Example

The Pi adapter wraps the SDK's built-in tools with path-restricted operations:

```typescript
import {
  createReadTool,
  createWriteTool,
  createEditTool,
} from "@mariozechner/pi-coding-agent";
import {
  createRestrictedReadOperations,
  createRestrictedWriteOperations,
  createRestrictedEditOperations,
} from "./path-restriction.ts";

// Create path-restricted operations
const pathRestriction = { rootDir: worktreePath };

const { session } = await createAgentSession({
  cwd: worktreePath,
  customTools: [
    createReadTool(worktreePath, {
      operations: createRestrictedReadOperations(pathRestriction),
    }),
    createWriteTool(worktreePath, {
      operations: createRestrictedWriteOperations(pathRestriction),
    }),
    createEditTool(worktreePath, {
      operations: createRestrictedEditOperations(pathRestriction),
    }),
  ],
});
```

### Custom Adapter Example

For other adapters, wrap tool implementations with path validation:

```typescript
import { assertPathAllowed } from "workhorse-core";

class MyAdapter extends AgentAdapter {
  private createTools() {
    const options = { rootDir: this.worktreePath };

    return {
      write: async (path: string, content: string) => {
        const safePath = assertPathAllowed(path, options);
        await fs.writeFile(safePath, content);
      },
      read: async (path: string) => {
        const safePath = assertPathAllowed(path, options);
        return fs.readFile(safePath, "utf-8");
      },
    };
  }
}
```

## API Reference

### `validatePath(path, options)`

Validates that a path is within allowed directories.

**Parameters:**
- `path: string` - Path to validate (relative or absolute)
- `options: PathValidationOptions` - Validation options

**Returns:** `PathValidationResult`
- `valid: boolean` - Whether path is allowed
- `normalizedPath: string` - The absolute, normalized path
- `error?: string` - Error message if invalid

### `isPathAllowed(path, options)`

Convenience function that returns a boolean.

### `assertPathAllowed(path, options)`

Throws an error if path is not allowed, otherwise returns the normalized path.

### `createPathValidator(options)`

Creates a validator bound to specific options.

**Returns:**
- `validate(path)` - Full validation result
- `isAllowed(path)` - Boolean check
- `assert(path)` - Assert and return normalized path
- `rootDir` - The bound root directory

### `PathValidationOptions`

```typescript
interface PathValidationOptions {
  /** The root directory that all paths must be within */
  rootDir: string;
  /** Additional allowed directories outside the root */
  additionalAllowedDirs?: string[];
}
```

## Security Considerations

1. **Always use absolute paths internally** - The validation functions resolve paths to absolute before checking
2. **Normalize paths** - Handles `..`, `.`, and redundant separators
3. **Check before every operation** - Don't cache validation results across different paths
4. **Fail closed** - If validation fails, deny the operation
5. **Log violations** - Consider logging path restriction violations for security monitoring
