# Code Quality Guidelines

## Core Principles

### 1. Define Where Used
Define state, hooks, and computations in the component that actually uses them.

**❌ Bad:** Parent defines solely to pass to child
```typescript
// App.tsx
const notifications = useNotifications({ ticketId });
const unreadCount = () => notifications.unreadCount();

<Layout 
  notifications={notifications.notifications()}
  unreadCount={unreadCount()}
  hasBlocking={notifications.hasBlocking()}
/>
```

**✅ Good:** Pass minimal primitive, child composes its own hooks
```typescript
// App.tsx
<Layout currentTicketId={currentTicket()?.id} />

// Layout.tsx
const notifications = useNotifications({ ticketId: () => props.currentTicketId });
```

### 2. Props Are a Last Resort
Only add props when the parent needs the data for its own logic.

**Test:** *"Does the parent use this for anything other than passing it down?"*

**❌ Bad:** 7 handler props drilled through Layout for keyboard shortcuts
```typescript
// App.tsx
<Layout
  onEscalate={() => ...}
  onSwitchAgent={() => ...}
  onToggleAgent={() => ...}
  onOpenInJira={() => ...}
  onCloseTicket={() => ...}
/>
```

**✅ Good:** Layout uses composable directly
```typescript
// Layout.tsx
const actions = useTicketActions({ ticketId: () => props.currentTicketId });
// Keyboard handler calls actions.escalate(), actions.toggleAgent(), etc.
```

### 3. Composables Over Prop Drilling
When multiple related handlers need to cross component boundaries, extract into a composable that components import directly.

**Location:** `src/hooks/use-feature/use-feature.ts`

### 4. Context for Deep Trees Only
Use context when arbitrary-depth descendants need access.

- **Don't use for:** Immediate parent-child (use props)
- **Don't use for:** Avoiding component design decisions

**Good context uses:** Theme, keyboard shortcuts, navigation state

### 5. The 200 LOC Enforcer
Maximum 200 lines per file. This forces:
- Logic extraction into composables
- Single-responsibility components
- Clear separation of concerns

## Code Review Checklist

- [ ] Are props only passed when parent needs them?
- [ ] Can any props be replaced with child-internal hooks?
- [ ] Are handlers grouped into composables rather than prop-drilled individually?
- [ ] Is the file under 200 lines?
- [ ] Are related files colocated in folders with `index.ts` exports?