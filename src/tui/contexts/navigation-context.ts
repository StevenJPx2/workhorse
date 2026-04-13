/**
 * Navigation context - Lock-based keyboard navigation control
 *
 * Implements a LIFO lock stack where only the top lock holder
 * receives keyboard events. Used to coordinate navigation between
 * sidebar and modals/palettes.
 *
 * @example
 * // In a modal component
 * const lock = navigation.acquireLock('my-modal');
 *
 * useKeyboard((key) => {
 *   if (!lock.hasControl()) return;
 *   // Handle keyboard...
 * });
 *
 * onCleanup(() => lock.release());
 */

import { createContext, useContext, createSignal, type Accessor } from "solid-js";

/**
 * A navigation lock that controls keyboard focus
 */
export interface NavigationLock {
  /** Unique ID for this lock */
  id: string;
  /** Whether this lock currently has navigation control (top of stack) */
  hasControl: Accessor<boolean>;
  /** Release this lock, returning control to previous holder */
  release: () => void;
}

/**
 * Navigation context value
 */
export interface NavigationContextValue {
  /** Acquire a navigation lock (idempotent - same ID returns same lock) */
  acquireLock: (id: string) => NavigationLock;
  /** Check if any lock is active (for base-level consumers like sidebar) */
  isLocked: Accessor<boolean>;
}

export const NavigationContext = createContext<NavigationContextValue>();

/**
 * Create navigation context value (used by provider)
 */
export function createNavigationValue(): NavigationContextValue {
  // LIFO stack of lock IDs
  const [lockStack, setLockStack] = createSignal<string[]>([]);

  // Map for idempotent lock acquisition
  const locks = new Map<string, NavigationLock>();

  const isLocked: Accessor<boolean> = () => lockStack().length > 0;

  const acquireLock = (id: string): NavigationLock => {
    // Return existing lock if already acquired (idempotent)
    const existing = locks.get(id);
    if (existing) return existing;

    // Push to stack
    setLockStack((stack) => [...stack, id]);

    const lock: NavigationLock = {
      id,
      hasControl: () => {
        const stack = lockStack();
        return stack.length > 0 && stack[stack.length - 1] === id;
      },
      release: () => {
        locks.delete(id);
        setLockStack((stack) => stack.filter((lockId) => lockId !== id));
      },
    };

    locks.set(id, lock);
    return lock;
  };

  return { acquireLock, isLocked };
}

/**
 * Hook to access navigation lock system
 *
 * @example
 * const navigation = useNavigation();
 *
 * // Check if any modal has locked navigation
 * if (navigation.isLocked()) return;
 *
 * // Or acquire a lock for exclusive control
 * const lock = navigation.acquireLock('my-component');
 */
export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    // Return a no-op default if not in provider
    // Lock always has control since there's no competition
    return {
      acquireLock: (id: string) => ({
        id,
        hasControl: () => true,
        release: () => {},
      }),
      isLocked: () => false,
    };
  }
  return context;
}
