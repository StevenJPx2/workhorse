# CommandPalette

Vim-style command launcher with fuzzy search and submenu support.

## Usage

```tsx
import { useCommandPalette } from "@/hooks";
import { CommandPalette, type Command } from "@/components/command-palette";

const commands: Command[] = [
  {
    id: "add-ticket",
    label: "Add New Ticket",
    shortcut: "n",
    type: "action",
    action: () => addTicket(),
  },
  {
    id: "theme",
    label: "Change Theme",
    type: "submenu",
    items: [
      { id: "default", label: "Default", action: () => setTheme("default") },
      { id: "gruvbox", label: "Gruvbox", action: () => setTheme("gruvbox") },
    ],
  },
];

function App() {
  const palette = useCommandPalette({ commands });

  useKeyboard((key) => {
    if (key.name === ":") palette.open();
  });

  return <CommandPalette palette={palette} />;
}
```

## Command Types

### ActionCommand

Simple command that executes an action:

```tsx
{
  id: "quit",
  label: "Quit Application",
  shortcut: "q",
  category: "App",
  type: "action",
  action: () => quit(),
}
```

### SubmenuCommand

Command that opens a submenu of options:

```tsx
{
  id: "theme",
  label: "Change Theme",
  type: "submenu",
  items: [
    { id: "default", label: "Default", action: () => setTheme("default"), isActive: true },
    { id: "gruvbox", label: "Gruvbox", action: () => setTheme("gruvbox") },
  ],
}
```

## Keyboard Navigation

| Key           | Action                               |
| ------------- | ------------------------------------ |
| `:`           | Open palette                         |
| `Escape`      | Close palette / Go back from submenu |
| `j` / `Down`  | Move selection down                  |
| `k` / `Up`    | Move selection up                    |
| `Enter`       | Execute selected / Enter submenu     |
| `Backspace`   | Delete character from search         |
| Any character | Append to search query               |

## Components

- `CommandPalette` - Main modal component
- `CommandItem` - Individual command row

## Related

- `useCommandPalette` hook - State management
- `useCommandFilter` hook - Fuzzy filtering
- `Modal` component - Base overlay
- `Dialog` component - Structured modal
