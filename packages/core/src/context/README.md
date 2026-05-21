# context

Async-safe dependency injection via `unctx` + `AsyncLocalStorage`.

## Usage

```typescript
import { runWithContext, useWorkhorse } from "#context";

// Inside plugin setup or any code running in context:
const { config, hooks } = useWorkhorse();

// To run code within context:
runWithContext({ config, hooks }, async () => {
  // useWorkhorse() works here
});
```

## API

| Function            | Description                            |
| ------------------- | -------------------------------------- |
| `useWorkhorse()`    | Get context (throws if not in context) |
| `tryUseWorkhorse()` | Get context or `undefined`             |
| `runWithContext()`  | Execute function with context          |
| `setContext()`      | Set singleton context (testing only)   |
| `unsetContext()`    | Clear singleton context (testing only) |

## WorkhorseContext

```typescript
interface WorkhorseContext {
  readonly config: Config;
  readonly hooks: Emitter<HookEventMap>;
}
```

Extended as services are added (db, memory, monitor).
