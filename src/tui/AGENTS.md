# Agent Instructions — `src/tui`

This file contains guidance for AI coding agents working inside the `src/tui` module.

---

## What This Module Is

`src/tui` is the **terminal user interface layer** of Jiratown.  
It uses [OpenTUI](https://github.com/anomalyco/opentui) as the terminal rendering engine and [Solid.js](https://solidjs.com) as the reactive UI framework.

Every visual element the user sees and every keyboard interaction they make goes through this module.

---

## Critical Rules

### 1. Components must be purely presentational

Components receive props and call hooks. They must **not** contain business logic, fetch data directly, or import from `src/core` (except for shared types).

```tsx
// ✅ Good
function TicketItem(props: TicketItemProps) {
  const { theme } = useTheme();
  const statusCfg = getStatusConfig(props.status);
  return <box backgroundColor={theme().bg.elevated}>{props.id}</box>;
}

// ❌ Bad
function TicketItem(props: { ticketId: string }) {
  const db = getDatabase();                          // No! Use a hook
  const ticket = db.prepare("SELECT...").get(...)    // No! Business logic in component
  return <box>{ticket.id}</box>;
}
```

### 2. All business logic lives in hooks

Hooks are the single source of truth for data and operations. Every feature should be a hook first, component second.

### 3. OpenTUI uses snake_case element names

OpenTUI components use lowercase with underscores (`<tab_select>`, `<scroll_box>`). Standard HTML-like elements use lowercase (`<box>`, `<text>`). Solid.js components use PascalCase (`<TicketSidebar>`).

### 4. File names use kebab-case

`ticket-sidebar.tsx`, `use-ticket-navigation.ts`, `agent-display.tsx` — never PascalCase or camelCase filenames.

### 5. Max 200 lines per file

If a component or hook grows beyond 200 lines, split it. See the colocated folder pattern below.

---

## Adding a New Component

### Step 1 — Create the directory

```
components/my-component/
├── index.ts           ← Re-exports public API
├── my-component.tsx   ← Main component
├── types.ts           ← Props interfaces (if complex)
└── use-my-state.ts    ← Related hook (if needed)
```

### Step 2 — Write the component

```tsx
// my-component.tsx
import { useTheme, spacing } from "../../theme/index.ts";

export interface MyComponentProps {
  value: string;
  onPress?: () => void;
}

export function MyComponent(props: MyComponentProps) {
  const { theme } = useTheme();

  return (
    <box
      flexDirection="row"
      padding={spacing.sm}
      backgroundColor={theme().bg.base}
      fg={theme().text.primary}
    >
      <text>{props.value}</text>
    </box>
  );
}
```

### Step 3 — Export from `index.ts`

```ts
// index.ts
export { MyComponent } from "./my-component.tsx";
export type { MyComponentProps } from "./my-component.tsx";
```

### Step 4 — Write tests

```ts
// my-component.test.ts
import { renderWithProviders } from "../../sandbox/test-helper.tsx";
import { MyComponent } from "./index.ts";

describe("MyComponent", () => {
  it("renders value", () => {
    renderWithProviders(<MyComponent value="hello" />);
    // assert on rendered output
  });
});
```

---

## Adding a New Hook

Hooks live in `hooks/my-hook/` and follow this structure:

```
hooks/my-hook/
├── index.ts
├── types.ts           ← Options + Return interfaces
├── my-hook.ts         ← Hook implementation
└── my-hook.test.ts    ← Tests
```

### Hook template

```ts
// my-hook.ts
import { createSignal, onCleanup } from "solid-js";
import type { MyHookOptions, MyHookReturn } from "./types.ts";

export function useMyHook(options: MyHookOptions): MyHookReturn {
  const [value, setValue] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  // Side effects with cleanup
  onCleanup(() => {
    // cleanup subscriptions, timers, etc.
  });

  const doSomething = async () => {
    setLoading(true);
    try {
      // ...
    } finally {
      setLoading(false);
    }
  };

  return {
    value,
    loading,
    doSomething,
  };
}
```

### Export the hook

Add to `hooks/index.ts`:

```ts
export { useMyHook } from "./my-hook/index.ts";
export type { MyHookOptions, MyHookReturn } from "./my-hook/index.ts";
```

---

## Adding a New Context

Contexts provide shared state without prop drilling. Use them when multiple unrelated components need the same data.

```tsx
// contexts/my-context.tsx
import { createContext, useContext, type JSX } from "solid-js";

export interface MyContextValue {
  data: Accessor<string>;
  update: (value: string) => void;
}

const MyContext = createContext<MyContextValue>();

export function MyProvider(props: { children: JSX.Element }) {
  const [data, setData] = createSignal("");
  return (
    <MyContext.Provider value={{ data, update: setData }}>
      {props.children}
    </MyContext.Provider>
  );
}

export function useMyContext(): MyContextValue {
  const ctx = useContext(MyContext);
  if (!ctx) throw new Error("useMyContext must be used within MyProvider");
  return ctx;
}
```

Mount the provider in `app/app-content.tsx` inside the appropriate level of the provider stack. Providers higher in the tree are available to all descendants.

---

## Keyboard Handling

### The check-first pattern

Every `useKeyboard` handler **must** start with these guards:

```ts
useKeyboard((key) => {
  if (navigation.isLocked()) return;    // another component has exclusive control
  if (keyboard.isInputMode()) return;   // a text input has focus
  // ... handle keys
});
```

Without these guards, keyboard events will bleed into text inputs and conflict with modals.

### Lock pattern for exclusive keyboard control

When your component needs exclusive keyboard control (e.g., a text input, a modal):

```ts
// Acquire lock when entering "edit mode"
let lock: ReturnType<typeof navigation.acquireLock> | undefined;

keyboard.enterInputMode(myInputId);
lock = navigation.acquireLock(myInputId);

// Release when exiting
keyboard.exitInputMode(myInputId);
lock?.release();
lock = undefined;
```

### Key names

OpenTUI key events provide these properties:

```ts
key.name     // "a", "enter", "escape", "tab", "backspace", "space",
             // "up", "down", "left", "right", "f1"..., etc.
key.ctrl     // boolean
key.meta     // boolean
key.shift    // boolean
```

---

## Theme Usage

Always consume theme through `useTheme()`, never hardcode colors:

```tsx
const { theme } = useTheme();

// Colors
theme().bg.base           // main background
theme().bg.elevated       // sidebar/footer background
theme().bg.highlight      // selected item background
theme().text.primary      // main text
theme().text.dim          // muted text
theme().border.focus      // focused input border
theme().status.implementing  // status-specific color
theme().agent.opencode    // agent badge color

// Presets for layout
import { spacing, borderStyles } from "../theme/index.ts";
padding={spacing.sm}      // 1
padding={spacing.md}      // 2
```

**Never** use raw hex strings like `"#ff0000"` in component JSX. Use the theme object.

---

## Solid.js Reactive Patterns

### Signal creation

```ts
const [count, setCount] = createSignal(0);
const [items, setItems] = createSignal<string[]>([]);
```

### Derived values (memos)

```ts
const total = createMemo(() => items().length);
const isEmpty = () => items().length === 0;  // simple getter — no createMemo needed
```

### Effects

```ts
createEffect(() => {
  // runs whenever any accessed signal changes
  console.log("count changed:", count());
});
```

### Cleanup

```ts
onCleanup(() => {
  clearInterval(myInterval);
  socket.close();
});
```

### Conditional rendering

```tsx
// Use Show, not ternary, for reactive conditions
<Show when={isLoading()}>
  <text>Loading...</text>
</Show>

<Show when={ticket()} fallback={<EmptyState />}>
  {(t) => <TicketPane ticket={t()} />}
</Show>
```

### List rendering

```tsx
<For each={tickets()}>
  {(ticket, i) => (
    <TicketItem
      ticket={ticket}
      isSelected={i() === selection.selectedIndex()}
    />
  )}
</For>
```

### Accessor props pattern

Props that are reactive must be typed as `Accessor<T>` or `() => T`, not just `T`:

```ts
interface Props {
  agentState: AgentState | (() => AgentState);   // can be static or reactive
}

// Inside component
const resolvedState = () => {
  const state = props.agentState;
  return typeof state === "function" ? state() : state;
};
```

---

## Writing Tests for Hooks

Hooks must be tested in isolation. Use the pattern from existing tests:

```ts
import { createRoot } from "solid-js";
import { useMyHook } from "./my-hook.ts";

describe("useMyHook", () => {
  it("initializes correctly", () => {
    createRoot((dispose) => {
      const hook = useMyHook({ option: "value" });
      
      expect(hook.value()).toBe(null);
      expect(hook.loading()).toBe(false);
      
      dispose();
    });
  });

  it("updates value", async () => {
    await new Promise<void>((resolve) => {
      createRoot(async (dispose) => {
        const hook = useMyHook({ option: "value" });
        
        await hook.doSomething();
        expect(hook.value()).toBe("expected");
        
        dispose();
        resolve();
      });
    });
  });
});
```

### Injecting dependencies for testability

Hooks that call `src/core` functions should accept those functions as optional dependencies:

```ts
// types.ts
export interface MyHookDeps {
  fetchData?: (id: string) => Promise<Data>;
}

export interface MyHookOptions {
  id: string;
  deps?: MyHookDeps;
}

// my-hook.ts
const defaultDeps = { fetchData: realFetchData };

export function useMyHook(options: MyHookOptions) {
  const { fetchData } = { ...defaultDeps, ...options.deps };
  // use fetchData instead of importing directly
}

// In test:
const hook = useMyHook({
  id: "TEST-1",
  deps: { fetchData: async () => mockData },
});
```

---

## Component Dos and Don'ts

### ✅ DO

- Use `useTheme()` for all colors
- Use `spacing.sm/md/lg` for padding/gap values
- Pass `Accessor<T>` for reactive props, plain `T` for static props
- Use `<Show>` for conditional rendering
- Use `<For>` for list rendering
- Check `navigation.isLocked()` and `keyboard.isInputMode()` before handling keys
- Colocate related hooks, types, and sub-components in a single folder
- Export only the public API from `index.ts`

### ❌ DON'T

- Import from `src/core` directly in components (use hooks instead)
- Hardcode color strings in JSX
- Write business logic inside components
- Use `console.log` for debugging in production paths (use `orchestratorTrace` in core, or structured logging)
- Skip the `navigation.isLocked()` guard in keyboard handlers
- Put multiple components in one file if it pushes past 200 lines
- Use `createMemo` for simple one-liner derived values (use a getter function)

---

## Sandbox Usage

When building a new component, create a demo in `sandbox/demos/` to test it visually before writing automated tests:

```tsx
// sandbox/demos/my-component-demo.tsx
export function MyComponentDemo() {
  return (
    <box flexDirection="column" gap={1}>
      <MyComponent value="Hello world" />
      <MyComponent value="Another value" onPress={() => {}} />
    </box>
  );
}
```

Register in `sandbox/sandbox-app/menu.tsx`:

```ts
{ label: "MyComponent", component: MyComponentDemo }
```

Then run `bun run sandbox` and navigate to your demo.

---

## Coverage Requirement

**97% code coverage required** across all files in this module.

Before committing:

```bash
bun run coverage
```

Every hook function, every conditional branch inside a hook, and every component render path must be tested. The sandbox snapshot tests count toward coverage for component rendering.
