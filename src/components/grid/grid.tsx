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

import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useKeyboardContext } from "../../lib/keyboard-context.ts";
import { GridContext, type Direction, type GridCellConfig, type GridContextValue } from "./grid-context.ts";
import { type GridProps, type CellData } from "./grid-types.ts";
import { getNeighbor } from "./grid-navigation.ts";

export type { GridProps } from "./grid-types.ts";

/**
 * Grid container with spatial navigation
 */
export function Grid(props: GridProps) {
  const keyboard = useKeyboardContext();

  const [cells, setCells] = createSignal<Map<string, CellData>>(new Map());
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

  // Move focus in a direction
  const move = (direction: Direction): void => {
    const current = focusedId();
    if (!current) return;

    const neighbor = getNeighbor({
      cells: cells(),
      fromId: current,
      direction,
      rows: props.rows,
      cols: props.cols,
      wrap: wrap(),
    });

    if (neighbor && neighbor !== current) {
      setFocusedId(neighbor);
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
    if (editModeId()) {
      if (key.name === "return" || key.name === "escape") {
        exitEditMode();
      }
      return;
    }

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

  const contextValue: GridContextValue = {
    rows: props.rows,
    cols: props.cols,
    cells: cells(),
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

  return (
    <GridContext.Provider value={contextValue}>
      {props.children}
    </GridContext.Provider>
  );
}