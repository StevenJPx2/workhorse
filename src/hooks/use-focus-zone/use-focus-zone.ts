/**
 * useFocusZone hook - Focus region management
 *
 * Provides a way to manage focus within regions of the UI,
 * allowing components to declare themselves as focus zones
 * and track which zone is currently active.
 */

import { createSignal, type Accessor } from "solid-js";

/**
 * Focus zone identifier
 */
export type FocusZoneId = string;

/**
 * Options for configuring the focus zone hook
 */
export interface UseFocusZoneOptions {
  /** Unique identifier for this focus zone */
  zoneId: FocusZoneId;
  /** Whether this zone is initially active */
  initialActive?: boolean;
  /** Callback when zone becomes active */
  onActivate?: () => void;
  /** Callback when zone becomes inactive */
  onDeactivate?: () => void;
}

/**
 * Return value from useFocusZone hook
 */
export interface UseFocusZoneReturn {
  /** Zone identifier */
  zoneId: FocusZoneId;
  /** Whether this zone is currently active */
  isActive: Accessor<boolean>;
  /** Activate this focus zone */
  activate: () => void;
  /** Deactivate this focus zone */
  deactivate: () => void;
  /** Toggle focus zone state */
  toggle: () => void;
}

/**
 * Hook for managing focus within a UI region
 *
 * Use this to create focus zones that can be activated/deactivated
 * to control which part of the UI receives keyboard input.
 *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const { isActive, activate } = useFocusZone({
 *     zoneId: 'sidebar',
 *     onActivate: () => console.log('Sidebar focused'),
 *   });
 *
 *   return (
 *     <box
 *       onClick={activate}
 *       borderColor={isActive() ? 'blue' : 'gray'}
 *     >
 *       <text>Sidebar content</text>
 *     </box>
 *   );
 * }
 * ```
 */
export function useFocusZone(
  options: UseFocusZoneOptions
): UseFocusZoneReturn {
  const [isActive, setIsActive] = createSignal(options.initialActive ?? false);

  const activate = (): void => {
    if (!isActive()) {
      setIsActive(true);
      options.onActivate?.();
    }
  };

  const deactivate = (): void => {
    if (isActive()) {
      setIsActive(false);
      options.onDeactivate?.();
    }
  };

  const toggle = (): void => {
    if (isActive()) {
      deactivate();
    } else {
      activate();
    }
  };

  return {
    zoneId: options.zoneId,
    isActive,
    activate,
    deactivate,
    toggle,
  };
}

/**
 * Create a focus zone manager for coordinating multiple zones
 *
 * Only one zone can be active at a time. When a zone is activated,
 * the previously active zone is automatically deactivated.
 */
export interface FocusZoneManager {
  /** Currently active zone ID (null if none) */
  activeZone: Accessor<FocusZoneId | null>;
  /** Check if a specific zone is active */
  isZoneActive: (zoneId: FocusZoneId) => boolean;
  /** Activate a zone (deactivates current) */
  activateZone: (zoneId: FocusZoneId) => void;
  /** Deactivate the currently active zone */
  deactivateZone: () => void;
  /** Register a callback for zone changes */
  onZoneChange: (callback: (zoneId: FocusZoneId | null) => void) => () => void;
}

/**
 * Create a focus zone manager
 *
 * @example
 * ```tsx
 * const manager = createFocusZoneManager();
 *
 * // In component
 * const isActive = () => manager.isZoneActive('sidebar');
 * const handleClick = () => manager.activateZone('sidebar');
 * ```
 */
export function createFocusZoneManager(
  initialZone?: FocusZoneId
): FocusZoneManager {
  const [activeZone, setActiveZone] = createSignal<FocusZoneId | null>(
    initialZone ?? null
  );
  const callbacks = new Set<(zoneId: FocusZoneId | null) => void>();

  const notifyCallbacks = (zoneId: FocusZoneId | null): void => {
    callbacks.forEach((cb) => {
      cb(zoneId);
    });
  };

  const isZoneActive = (zoneId: FocusZoneId): boolean => {
    return activeZone() === zoneId;
  };

  const activateZone = (zoneId: FocusZoneId): void => {
    if (activeZone() !== zoneId) {
      setActiveZone(zoneId);
      notifyCallbacks(zoneId);
    }
  };

  const deactivateZone = (): void => {
    if (activeZone() !== null) {
      setActiveZone(null);
      notifyCallbacks(null);
    }
  };

  const onZoneChange = (
    callback: (zoneId: FocusZoneId | null) => void
  ): (() => void) => {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  };

  return {
    activeZone,
    isZoneActive,
    activateZone,
    deactivateZone,
    onZoneChange,
  };
}
