# Plan: Unified Activity Renderer Architecture

**Status: ✅ IMPLEMENTED**

## Overview

Create a single, extensible renderer system that handles all activity types (notifications, tool calls, and future types) using a discriminated union. Plugins register renderers for the activity types they care about.

## Design

### Activity Input (Discriminated Union)

```typescript
import type { Notification } from "@jiratown/core";

export type ActivityInput =
  | { kind: "notification"; notification: Notification }
  | { kind: "tool"; tool: string; args: unknown }
  // Future extensions:
  // | { kind: "event"; event: IssueEvent }
  // | { kind: "message"; message: ChatMessage }
```

### Rendered Output

```typescript
export interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}
```

### Renderer Function

```typescript
export type ActivityRenderer = (input: ActivityInput) => RenderedActivity | null;
```

Returning `null` means "I don't handle this input, try the next renderer."

### Hook

```typescript
// In core HookEventMap
"tui.register_renderer": {
  id: string;                    // Unique renderer ID (e.g., "jira", "pi-tools", "jiratown")
  renderer: unknown;             // ActivityRenderer function
  priority?: number;             // Higher = checked first (default: 0)
}
```

## Plugin Registration Examples

### Jira Plugin

```typescript
// packages/plugins/jira/src/index.ts

function jiraRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;
  if (input.notification.source !== "jira") return null;
  
  const meta = input.notification.metadata as Record<string, unknown> | undefined;
  const jiraKey = meta?.jiraKey as string | undefined;
  
  let icon = "🎫";
  if (input.notification.title.toLowerCase().includes("comment")) icon = "💬";
  if (input.notification.title.toLowerCase().includes("transition")) icon = "➡️";
  
  return {
    icon,
    title: input.notification.title,
    subtitle: jiraKey,
    body: input.notification.body ?? undefined,
    style: "box",
  };
}

// In setup():
ctx.hooks.emit("tui.register_renderer", {
  id: "jira",
  renderer: jiraRenderer,
});
```

### PI Adapter Plugin

```typescript
// packages/plugins/pi-adapter/src/index.ts

function piToolRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;
  
  const tool = input.tool.toLowerCase();
  const args = (input.args ?? {}) as Record<string, unknown>;
  
  // Read tool
  if (tool.includes("read")) {
    return {
      icon: "📖",
      title: "read",
      subtitle: String(args.filePath ?? args.path ?? ""),
      style: "inline",
      color: "info",
    };
  }
  
  // Write/Edit tool
  if (tool.includes("write") || tool.includes("edit")) {
    const isCreate = tool.includes("write");
    return {
      icon: isCreate ? "📄" : "✏️",
      title: isCreate ? "create" : "edit",
      subtitle: String(args.filePath ?? args.file ?? args.path ?? ""),
      style: "inline",
      color: isCreate ? "success" : "warning",
    };
  }
  
  // Bash tool
  if (tool.includes("bash")) {
    return {
      icon: "$",
      title: String(args.description ?? args.command ?? ""),
      style: "inline",
      color: "accent",
    };
  }
  
  // Grep tool
  if (tool.includes("grep")) {
    return {
      icon: "🔍",
      title: "grep",
      subtitle: String(args.pattern ?? ""),
      style: "inline",
      color: "info",
    };
  }
  
  // Glob tool
  if (tool.includes("glob")) {
    return {
      icon: "📂",
      title: "glob",
      subtitle: String(args.pattern ?? ""),
      style: "inline",
      color: "info",
    };
  }
  
  // Don't handle other tools
  return null;
}

// In setup():
ctx.hooks.emit("tui.register_renderer", {
  id: "pi-tools",
  renderer: piToolRenderer,
});
```

### Core Builtin Plugin (Jiratown Tools)

```typescript
// packages/core/src/plugins/builtin/index.ts

function jiratownToolRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;
  if (!input.tool.startsWith("jiratown_")) return null;
  
  const args = (input.args ?? {}) as Record<string, unknown>;
  
  if (input.tool === "jiratown_update_status") {
    return {
      icon: "⚡",
      title: `status → ${args.status}`,
      style: "inline",
      color: getStatusColor(String(args.status)),
    };
  }
  
  if (input.tool === "jiratown_escalate") {
    return {
      icon: "🚨",
      title: args.blocking ? "BLOCKED" : "escalate",
      body: String(args.message ?? ""),
      style: "box",
      color: args.blocking ? "error" : "warning",
    };
  }
  
  if (input.tool === "jiratown_acknowledge") {
    return {
      icon: "✓",
      title: "acknowledged notifications",
      style: "inline",
      color: "success",
    };
  }
  
  return null;
}

// In setup():
ctx.hooks.emit("tui.register_renderer", {
  id: "jiratown-tools",
  renderer: jiratownToolRenderer,
});
```

## TUI Implementation

### Registry

```typescript
// packages/tui/src/renderers/registry.ts

import type { ActivityInput, ActivityRenderer, RenderedActivity } from "./types.ts";

interface RegisteredRenderer {
  id: string;
  renderer: ActivityRenderer;
  priority: number;
}

const renderers: RegisteredRenderer[] = [];

export function registerRenderer(
  id: string, 
  renderer: ActivityRenderer, 
  priority = 0
): void {
  // Remove existing renderer with same id
  const idx = renderers.findIndex(r => r.id === id);
  if (idx !== -1) renderers.splice(idx, 1);
  
  // Insert sorted by priority (highest first)
  const insertIdx = renderers.findIndex(r => r.priority < priority);
  if (insertIdx === -1) {
    renderers.push({ id, renderer, priority });
  } else {
    renderers.splice(insertIdx, 0, { id, renderer, priority });
  }
}

export function render(input: ActivityInput): RenderedActivity {
  for (const { renderer } of renderers) {
    const result = renderer(input);
    if (result) return result;
  }
  
  // Default fallback
  return defaultRenderer(input);
}

function defaultRenderer(input: ActivityInput): RenderedActivity {
  if (input.kind === "notification") {
    return {
      icon: "🔔",
      title: input.notification.title,
      body: input.notification.body ?? undefined,
      style: "box",
    };
  }
  
  if (input.kind === "tool") {
    return {
      icon: "⚡",
      title: input.tool,
      subtitle: formatArgs(input.args),
      style: "inline",
      color: "dim",
    };
  }
  
  // Future-proof: unknown kind
  return {
    icon: "?",
    title: "Unknown activity",
    style: "inline",
    color: "dim",
  };
}
```

### Activity Row Component

```typescript
// packages/tui/src/components/activity-row.tsx

import { Show } from "solid-js";
import { render } from "../renderers/registry.ts";
import type { ActivityInput } from "../renderers/types.ts";
import { getTheme } from "../theme.ts";

export function ActivityRow(props: { input: ActivityInput }) {
  const theme = getTheme();
  const rendered = () => render(props.input);
  
  const color = () => {
    const c = rendered().color;
    if (!c) return theme.colors.text;
    return theme.colors[c] ?? theme.colors.text;
  };

  return (
    <Show
      when={rendered().style === "box"}
      fallback={
        // Inline style
        <box flexDirection="row" paddingLeft={1} gap={1}>
          <text fg={color()}>{rendered().icon}</text>
          <text fg={theme.colors.dim}>{rendered().title}</text>
          <Show when={rendered().subtitle}>
            <text fg={theme.colors.text}>{rendered().subtitle}</text>
          </Show>
        </box>
      }
    >
      {/* Box style */}
      <box flexDirection="column" marginY={1}>
        <box flexDirection="row" paddingLeft={1} gap={1}>
          <text fg={color()}>{rendered().icon}</text>
          <text fg={color()}><b>{rendered().title}</b></text>
        </box>
        <Show when={rendered().subtitle}>
          <box paddingLeft={3}>
            <text fg={theme.colors.dim}>{rendered().subtitle}</text>
          </box>
        </Show>
        <Show when={rendered().body}>
          <box borderStyle="rounded" borderColor={color()} marginLeft={2} paddingX={1}>
            <text fg={theme.colors.text}>{rendered().body}</text>
          </box>
        </Show>
      </box>
    </Show>
  );
}
```

### Simplified Activity Types

```typescript
// packages/tui/src/primitives/activity-types.ts

import type { Notification } from "@jiratown/core";

export type ActivityItem =
  | { type: "text"; content: string; timestamp: Date }
  | { type: "tool"; tool: string; args: unknown; timestamp: Date }
  | { type: "notification"; notification: Notification; timestamp: Date }
  | { type: "steering"; reminder: string; timestamp: Date }
  | { type: "idle"; timestamp: Date };

// No more categorizeToolCall() - renderers handle display logic
```

## File Changes Summary

| Package | File | Change |
|---------|------|--------|
| core | `src/lib/hooks/types.ts` | Add `tui.register_renderer` hook type |
| core | `src/plugins/builtin/renderers.ts` | NEW: Jiratown tool renderer |
| core | `src/plugins/builtin/index.ts` | Emit renderer registration |
| jira | `src/index.ts` | Move renderer here, emit registration |
| github | `src/index.ts` | Move renderer here, emit registration |
| pi-adapter | `src/renderers.ts` | NEW: PI tool renderers |
| pi-adapter | `src/index.ts` | Emit renderer registration |
| tui | `src/renderers/types.ts` | NEW: ActivityInput, RenderedActivity, ActivityRenderer |
| tui | `src/renderers/registry.ts` | NEW: Unified renderer registry |
| tui | `src/renderers/index.ts` | Re-export from registry |
| tui | `src/plugin.ts` | Listen for `tui.register_renderer` hook |
| tui | `src/primitives/activity-types.ts` | Simplify types, remove categorizeToolCall |
| tui | `src/state/activity-store.ts` | Add notification.created listener |
| tui | `src/components/activity-row.tsx` | NEW: Unified activity row using registry |
| tui | `src/components/activity-rows.tsx` | Simplify dispatcher |
| tui | `src/components/activity-tool-rows.tsx` | DELETE |
| tui | `src/components/notification-box.tsx` | DELETE (merged into activity-row) |
| tui | `src/renderers/agent.ts` | DELETE (moved to core builtin) |
| tui | `src/renderers/default.ts` | DELETE (merged into registry) |

## Benefits

1. **Single extension point**: One hook for all activity rendering
2. **Discriminated union**: Type-safe, extensible to new activity kinds
3. **Plugin ownership**: Each plugin defines how its outputs are rendered
4. **Priority system**: Control renderer ordering when multiple could match
5. **Graceful fallback**: Unknown activities still render with defaults
6. **Future-proof**: Easy to add new `kind` values (events, messages, etc.)

## Migration Path

1. Add new types and registry to TUI
2. Add hook listener to TUI plugin
3. Move Jira/GitHub notification renderers to their plugins (already done)
4. Add PI tool renderers to pi-adapter plugin
5. Add Jiratown tool renderers to core builtin plugin
6. Update activity store to emit unified ActivityInput
7. Delete old hardcoded components
