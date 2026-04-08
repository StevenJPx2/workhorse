/**
 * Grid component - Spatial navigation container
 *
 * Provides keyboard navigation between cells using arrow keys.
 * Children (GridCells) render themselves - Grid just manages focus state.
 *
 * @example
 * <Grid rows={3} cols={2} wrap>
 *   <box flexDirection="column">
 *     <GridCell id="input" row={0} col={0}>
 *       <TextInput />
 *     </GridCell>
 *     <GridCell id="cancel" row={2} col={0}>
 *       <Button>Cancel</Button>
 *     </GridCell>
 *   </box>
 * </Grid>
 */

import { createSignal, type JSX } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useKeyboardContext } from "../../lib/keyboard-context.ts";
import {
  GridContext,
  type Direction,
  type GridCellConfig,
  type GridContextValue,
} from "./grid-context.ts";

export interface GridProps {
  /** Number of rows in the grid */
  rows: number;
  /** Number of columns in the grid */
  cols: number;
  /** Whether to wrap navigation at edges */
  wrap?: boolean;
  /** Grid content (GridCells wrapped in layout elements) */
  children: JSX.Element;
}

interface CellData {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/**
 * Grid container with spatial navigation
 */
export function Grid(props: GridProps) {
  const keyboard = useKeyboardContext();

  // Cell registry (just position data, no content)
  const [cells, setCells] = createSignal<Map<string, CellData>>(new Map());

  // Focus state signals
  const [focusedId, setFocusedId] = createSignal<string | null>(null);
  const [editModeId, setEditModeId] = createSignal<string | null>(null);

  const wrap = () => props.wrap ?? true;

  // Register a cell in the grid
  const registerCell = (id: string, config: GridCellConfig): void => {
    setCells(prev => {
      const next = new Map(prev);
      next.set(id, {
        id,
        row: config.row,
        col: config.col,
        rowSpan: config.rowSpan ?? 1,
        colSpan: config.colSpan ?? 1,
      });
      return next;
    });

    // Auto-focus first cell if none focused
    if (focusedId() === null) {
      setFocusedId(id);
    }
  };

  // Unregister a cell
  const unregisterCell = (id: string): void => {
    setCells(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    if (focusedId() === id) {
      setFocusedId(null);
    }
    if (editModeId() === id) {
      setEditModeId(null);
      keyboard.exitInputMode();
    }
  };

  // Set focus to a specific cell
  const setFocus = (id: string): void => {
    if (cells().has(id)) {
      setFocusedId(id);
      if (editModeId()) {
        setEditModeId(null);
        keyboard.exitInputMode();
      }
    }
  };

  // Enter edit mode for the focused cell
  // Also signals the keyboard context so other handlers (Modal, Layout)
  // know to suppress their keyboard shortcuts
  const enterEditMode = (id: string): void => {
    if (cells().has(id) && focusedId() === id) {
      setEditModeId(id);
      keyboard.enterInputMode(`grid-cell-${id}`);
    }
  };

  // Exit edit mode
  const exitEditMode = (): void => {
    setEditModeId(null);
    keyboard.exitInputMode();
  };

  // Get cell at position
  const getCellAt = (row: number, col: number): CellData | undefined => {
    for (const cell of cells().values()) {
      if (
        row >= cell.row &&
        row < cell.row + cell.rowSpan &&
        col >= cell.col &&
        col < cell.col + cell.colSpan
      ) {
        return cell;
      }
    }
    return undefined;
  };

  // Get neighbor in a direction
  const getNeighbor = (fromId: string, direction: Direction): string | null => {
    const from = cells().get(fromId);
    if (!from) return null;

    let targetRow = from.row;
    let targetCol = from.col;

    switch (direction) {
      case "up":
        targetRow = from.row - 1;
        if (targetRow < 0) {
          if (!wrap()) return null;
          targetRow = props.rows - 1;
        }
        break;
      case "down":
        targetRow = from.row + from.rowSpan;
        if (targetRow >= props.rows) {
          if (!wrap()) return null;
          targetRow = 0;
        }
        break;
      case "left":
        targetCol = from.col - 1;
        if (targetCol < 0) {
          if (!wrap()) return null;
          targetCol = props.cols - 1;
        }
        break;
      case "right":
        targetCol = from.col + from.colSpan;
        if (targetCol >= props.cols) {
          if (!wrap()) return null;
          targetCol = 0;
        }
        break;
    }

    const neighbor = getCellAt(targetRow, targetCol);
    return neighbor?.id ?? null;
  };

  // Movement functions
  const move = (direction: Direction): void => {
    const current = focusedId();
    if (!current) return;

    const neighbor = getNeighbor(current, direction);
    if (neighbor && neighbor !== current) {
      setFocusedId(neighbor);
      // Exit edit mode if active (shouldn't happen during navigation, but be safe)
      if (editModeId()) {
        setEditModeId(null);
        keyboard.exitInputMode();
      }
    }
  };

  const moveUp = () => move("up");
  const moveDown = () => move("down");
  const moveLeft = () => move("left");
  const moveRight = () => move("right");

  // Keyboard handler
  useKeyboard((key) => {
    // In edit mode - only handle Enter/Escape to exit
    if (editModeId()) {
      if (key.name === "return" || key.name === "escape") {
        exitEditMode();
      }
      return;
    }

    // Grid navigation mode
    switch (key.name) {
      case "up":
        moveUp();
        break;
      case "down":
        moveDown();
        break;
      case "left":
        moveLeft();
        break;
      case "right":
        moveRight();
        break;
      case "return":
        if (focusedId()) {
          enterEditMode(focusedId()!);
        }
        break;
    }
  });

  // Create context value
  const contextValue: GridContextValue = {
    rows: props.rows,
    cols: props.cols,
    cells: cells(), // Provide current cells map
    focusedId,
    editModeId,
    registerCell,
    unregisterCell,
    setFocus,
    enterEditMode,
    exitEditMode,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
  };

  // Grid just provides context - children handle their own layout
  return (
    <GridContext.Provider value={contextValue}>
      {props.children}
    </GridContext.Provider>
  );
}
