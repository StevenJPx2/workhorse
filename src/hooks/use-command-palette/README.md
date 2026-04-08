# useCommandPalette

State management hook for the command palette.

## Usage

```tsx
import { useCommandPalette } from "@/hooks";
import type { Command } from "@/components/command-palette";

const commands: Command[] = [
  { id: "add", label: "Add Ticket", type: "action", action: () => {} },
  { id: "quit", label: "Quit", type: "action", action: () => {} },
];

function App() {
  const palette = useCommandPalette({
    commands,
    onExecute: (cmd) => console.log("Executed:", cmd.id),
    onClose: () => console.log("Palette closed"),
  });

  // Open with `:` key
  useKeyboard((key) => {
    if (key.name === ":") palette.open();
  });

  return <CommandPalette palette={palette} />;
}
```

## API

### Options

| Option | Type | Description |
|--------|------|-------------|
| `commands` | `Command[]` | Available commands |
| `onExecute` | `(cmd) => void` | Called when command is executed |
| `onClose` | `() => void` | Called when palette closes |

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isOpen` | `Accessor<boolean>` | Whether palette is visible |
| `open` | `() => void` | Open the palette |
| `close` | `() => void` | Close the palette |
| `toggle` | `() => void` | Toggle open/close |
| `query` | `Accessor<string>` | Current search query |
| `setQuery` | `(q: string) => void` | Set search query |
| `appendToQuery` | `(char: string) => void` | Append character |
| `backspace` | `() => void` | Delete last character |
| `selectedIndex` | `Accessor<number>` | Currently selected item |
| `selectPrevious` | `() => void` | Move selection up |
| `selectNext` | `() => void` | Move selection down |
| `resetSelection` | `() => void` | Reset to first item |
| `displayItems` | `Accessor<Item[]>` | Items to display |
| `isInSubmenu` | `Accessor<boolean>` | In submenu view |
| `currentSubmenu` | `Accessor<SubmenuCommand \| null>` | Active submenu |
| `executeSelected` | `() => void` | Execute or enter submenu |
| `goBack` | `() => void` | Back from submenu or close |

## Submenu Support

When a SubmenuCommand is selected and executed:
1. Palette switches to submenu view
2. `displayItems` returns the submenu items
3. `isInSubmenu` becomes true
4. `goBack` returns to main list

```tsx
const themeCommand: SubmenuCommand = {
  id: "theme",
  label: "Change Theme",
  type: "submenu",
  items: [
    { id: "default", label: "Default", action: () => setTheme("default") },
    { id: "gruvbox", label: "Gruvbox", action: () => setTheme("gruvbox") },
  ],
};
```

## Integration

The hook is designed to be passed directly to the `CommandPalette` component:

```tsx
<CommandPalette palette={palette} />
```

The component handles all keyboard input internally when open.
