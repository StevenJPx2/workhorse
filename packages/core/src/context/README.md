# context

Async-safe dependency injection via `unctx` + `AsyncLocalStorage`.

## Usage

```typescript
import { useJiratown, runWithContext } from "#context";

// Inside plugin setup or any code running in context:
const { config, hooks } = useJiratown();

// To run code within context:
runWithContext({ config, hooks }, async () => {
  // useJiratown() works here
});
```

## API

| Function          | Description                                      |
|-------------------|--------------------------------------------------|
| `useJiratown()`   | Get context (throws if not in context)           |
| `tryUseJiratown()`| Get context or `undefined`                       |
| `runWithContext()`| Execute function with context                    |
| `setContext()`    | Set singleton context (testing only)             |
| `unsetContext()`  | Clear singleton context (testing only)           |

## JiratownContext

```typescript
interface JiratownContext {
  readonly config: Config;
  readonly hooks: Emitter<HookEventMap>;
}
```

Extended as services are added (db, memory, monitor).
