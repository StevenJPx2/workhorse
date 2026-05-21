# eslint-plugin-workhorse

Custom oxlint rules that enforce Workhorse coding conventions — keeping files small, imports clean, and code focused.

## What This Plugin Does

This plugin enforces architectural decisions that keep the codebase maintainable:

- **200-line file limit** — forces modular decomposition
- **Barrel file conventions** — clear module boundaries
- **Path alias enforcement** — readable imports
- **Code style rules** — async patterns, ternaries, comments

## Rules Reference

### File Organization

| Rule                           | Severity  | What It Does                                                    |
| ------------------------------ | --------- | --------------------------------------------------------------- |
| `max-lines-per-file`           | **error** | Max 200 lines (500 for tests). Forces splitting large files.    |
| `enforce-kebab-case-filenames` | warn      | Files must be `kebab-case.ts`, not `MyFile.ts` or `myFile.ts`.  |
| `enforce-colocated-exports`    | warn      | Folders with multiple `.ts` files must have `index.ts`.         |
| `enforce-test-colocation`      | warn      | Tests go in `__tests__/` when test ratio >30% or folder exists. |

### Import Conventions

| Rule                         | Severity | What It Does                                              |
| ---------------------------- | -------- | --------------------------------------------------------- |
| `prefer-path-alias`          | warn     | `../../foo` → `#config/foo` for deep imports.             |
| `no-index-imports`           | warn     | `./foo` not `./foo/index.ts`.                             |
| `no-reexport-outside-barrel` | warn     | Re-exports only in `index.ts` files.                      |
| `prefer-folder-barrel`       | warn     | Files that only re-export → convert to folder with index. |
| `enforce-barrel-exports`     | warn     | Barrel re-exporting barrels must use `export *`.          |

### Code Style

| Rule                           | Severity | What It Does                                        |
| ------------------------------ | -------- | --------------------------------------------------- |
| `prefer-then-chain`            | warn     | `(await x).foo` → `await x.then(r => r.foo)`.       |
| `no-cascading-ternary`         | warn     | Nested ternaries → object map or switch.            |
| `no-section-comments`          | warn     | Remove `// ---`, `// 1.`, `// Step 1:` scaffolding. |
| `no-single-reference-function` | warn     | Functions called once should be inlined.            |
| `no-single-use-variable`       | warn     | Variables used once should be inlined.              |

## Why These Rules Exist

### 200-Line Maximum (The Most Important Rule)

**Problem:** Large files become unmaintainable, hard to review, and indicate mixed responsibilities.

**Solution:** Hard limit forces extraction:

```typescript
// ❌ 400-line file with mixed concerns
export class UserService {
  // 150 lines of user logic
  // 100 lines of notification logic
  // 150 lines of validation logic
}

// ✅ Split into focused modules
// user-service.ts (< 200 lines)
// notification-service.ts (< 200 lines)
// user-validation.ts (< 200 lines)
```

Tests get 500-line allowance because test setup is inherently verbose.

### Path Aliases

**Problem:** Deep relative imports are fragile and hard to read:

```typescript
// ❌ Fragile, unclear what module this is
import { SteeringRule } from "../../../workflow/steering/rule";
```

**Solution:** Aliases defined in `packages/core/tsconfig.json`:

```typescript
// ✅ Clear, stable, refactor-friendly
import { SteeringRule } from "#workflow/steering";
```

Rule triggers at 2+ parent traversals (`../../`).

### Barrel Files

**Problem:** Without conventions, imports become chaotic:

```typescript
// ❌ Reaching into module internals
import { baz } from "./utils/index";
import { foo } from "./utils/string/helpers/formatter";
import { bar } from "./utils/string/helpers/validator";
```

**Solution:** Every folder with multiple files has `index.ts`:

```typescript
// ✅ Clean module boundary
import { bar, baz, foo } from "./utils";
```

### Async Style: `.then()` Over Parentheses

**Problem:** Parenthesized await is awkward:

```typescript
// ❌ Parentheses interrupt reading flow
const name = (await fetchUser(id)).profile.name;
```

**Solution:** Chain with `.then()`:

```typescript
// ✅ Reads left-to-right
const name = await fetchUser(id).then((u) => u.profile.name);
```

This rule is auto-fixable.

### No Scaffolding Comments

**Problem:** Section comments add noise, not information:

```typescript
// ❌ These comments don't help
// ---------------------
// Step 1: Fetch data
// ---------------------
const data = await fetch();

// ---------------------
// Step 2: Process
// ---------------------
const result = process(data);
```

**Solution:** Code should be self-documenting. If you need sections, extract functions:

```typescript
// ✅ Function names are the sections
const data = await fetchData();
const result = processData(data);
```

### No Single-Use Functions/Variables

**Problem:** Unnecessary indirection:

```typescript
// ❌ Why extract this?
function formatName(user: User) {
  return `${user.first} ${user.last}`;
}
const displayName = formatName(user);
console.log(displayName);

// ❌ Why name this?
const fullName = `${user.first} ${user.last}`;
console.log(fullName);
```

**Solution:** Inline when only used once:

```typescript
// ✅ Direct and clear
console.log(`${user.first} ${user.last}`);
```

Exception: Named bindings that add semantic clarity are fine.

## Configuration

In `.oxlintrc.json`:

```json
{
  "jsPlugins": ["./oxlint/eslint-plugin-workhorse"],
  "ignorePatterns": ["oxlint/**", "dist/**", "node_modules/**"],
  "rules": {
    "workhorse/max-lines-per-file": ["error", 200],
    "workhorse/enforce-kebab-case-filenames": "warn",
    "workhorse/enforce-colocated-exports": "warn",
    "workhorse/enforce-test-colocation": "warn",
    "workhorse/no-single-reference-function": "warn",
    "workhorse/no-single-use-variable": "warn",
    "workhorse/no-section-comments": "warn",
    "workhorse/no-reexport-outside-barrel": "warn",
    "workhorse/prefer-folder-barrel": "warn",
    "workhorse/no-index-imports": "warn",
    "workhorse/prefer-path-alias": "warn",
    "workhorse/prefer-then-chain": "warn",
    "workhorse/no-cascading-ternary": "warn"
  }
}
```

## Architecture

```
eslint-plugin-workhorse/
├── index.ts              # Plugin entry - exports all rules
├── rules/
│   ├── max-lines-per-file.ts
│   ├── enforce-kebab-case-filenames.ts
│   ├── enforce-colocated-exports.ts
│   ├── enforce-test-colocation.ts
│   ├── no-single-reference-function.ts
│   ├── no-single-use-variable.ts
│   ├── enforce-barrel-exports.ts
│   ├── no-index-imports.ts
│   ├── no-section-comments.ts
│   ├── no-reexport-outside-barrel.ts
│   ├── prefer-folder-barrel.ts
│   ├── prefer-path-alias.ts
│   ├── prefer-then-chain.ts
│   ├── no-cascading-ternary.ts
│   └── utils.ts          # Shared helpers
└── package.json
```

Each rule is a function that receives AST context and reports violations:

```typescript
export default function maxLinesPerFile(context: RuleContext) {
  return {
    Program(node: Program) {
      const lines = context.sourceCode.lines.length;
      const limit = context.options[0] ?? 200;

      if (lines > limit) {
        context.report({
          node,
          message: `File has ${lines} lines, max is ${limit}`,
        });
      }
    },
  };
}
```

## Integration with Pre-commit

Via `simple-git-hooks` and `lint-staged`:

```json
{
  "simple-git-hooks": {
    "pre-commit": "bunx lint-staged"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["oxfmt --write", "oxlint"]
  }
}
```

Files are formatted, then linted, before commit completes.
