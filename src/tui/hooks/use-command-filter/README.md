# useCommandFilter

Reactive fuzzy filtering hook for command lists.

## Usage

```tsx
import { useCommandFilter } from "@/hooks";

const commands = [
  { id: "add-ticket", label: "Add New Ticket" },
  { id: "toggle-theme", label: "Toggle Theme" },
  { id: "quit", label: "Quit Application" },
];

function CommandList() {
  const { query, setQuery, filteredItems } = useCommandFilter({
    items: commands,
    getText: (cmd) => cmd.label,
  });

  return (
    <>
      <input value={query()} onInput={(e) => setQuery(e.target.value)} />
      <For each={filteredItems()}>{(cmd) => <div>{cmd.label}</div>}</For>
    </>
  );
}
```

## API

### Options

| Option         | Type                   | Description                       |
| -------------- | ---------------------- | --------------------------------- |
| `items`        | `T[] \| Accessor<T[]>` | Items to filter                   |
| `getText`      | `(item: T) => string`  | Extract searchable text from item |
| `initialQuery` | `string`               | Initial query value (default: "") |

### Return Value

| Property        | Type                  | Description                        |
| --------------- | --------------------- | ---------------------------------- |
| `query`         | `Accessor<string>`    | Current search query               |
| `setQuery`      | `(q: string) => void` | Set the search query               |
| `clearQuery`    | `() => void`          | Clear the search query             |
| `filteredItems` | `Accessor<T[]>`       | Filtered items sorted by relevance |

## Fuzzy Matching

The fuzzy matcher:

- Matches characters in order (not necessarily consecutive)
- Case-insensitive
- Scores based on:
  - Consecutive character matches
  - Word boundary matches (start of words)
  - Exact case matches

### Examples

| Query | Text             | Match            |
| ----- | ---------------- | ---------------- |
| `att` | `Add Ticket`     | Yes (A-T-T)      |
| `ant` | `Add New Ticket` | Yes (A-N-T)      |
| `xyz` | `Add Ticket`     | No               |
| `tad` | `Add Ticket`     | No (wrong order) |

## Low-Level Functions

For non-reactive use cases:

```tsx
import { fuzzyMatch, fuzzyFilter } from "@/hooks";

// Single match
const result = fuzzyMatch("att", "Add Ticket");
// { matches: true, score: 4.5, matchedIndices: [0, 4, 9] }

// Filter array
const filtered = fuzzyFilter("th", items, (item) => item.label);
// Items containing "th" sorted by score
```
