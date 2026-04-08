/**
 * Grid context definitions
 *
 * Provides nested contexts for spatial navigation:
 * - GridContext: Manages grid-level state and navigation
 * - CellContext: Provides per-cell focus state to components
 */

import type { Accessor } from "solid-js";
import { createContext } from "solid-js";

/**
 * Cell registration data
 */
export interface GridCellConfig {
  id: string;
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
}

/**
 * Grid direction for navigation
 */
export type Direction = "up" | "down" | "left" | "right";

/**
 * Grid context value - provides navigation and cell management
 */
export interface GridContextValue {
  /** Grid dimensions */
  rows: number;
  cols: number;

  /** Cell registry */
  cells: Map<string, GridCellConfig>;

  /** Reactive focus state */
  focusedId: Accessor<string | null>;
  editModeId: Accessor<string | null>;

  /** Registration API */
  registerCell: (id: string, config: GridCellConfig) => void;
  unregisterCell: (id: string) => void;

  /** Focus management */
  setFocus: (id: string) => void;
  enterEditMode: (id: string) => void;
  exitEditMode: () => void;

  /** Navigation */
  moveUp: () => void;
  moveDown: () => void;
  moveLeft: () => void;
  moveRight: () => void;
}

/**
 * Grid context - provides grid-level navigation state
 */
export const GridContext = createContext<GridContextValue>();

/**
 * Cell context value - provides per-cell focus state
 */
export interface CellContextValue {
  cellId: string;
  isFocused: Accessor<boolean>;
  isEditMode: Accessor<boolean>;
}

/**
 * Cell context - provides local focus state to components inside a GridCell
 */
export const CellContext = createContext<CellContextValue>();
