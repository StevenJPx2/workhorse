/**
 * GridCell component - Individual cell in a spatial navigation grid
 *
 * Registers itself with the parent Grid and provides CellContext
 * to child components. Renders its own children in place.
 *
 * @example
 * <GridCell id="input" row={0} col={0} colSpan={2}>
 *   <TextInput />
 * </GridCell>
 */

import { onMount, onCleanup, useContext, type JSX } from "solid-js";
import { createMemo } from "solid-js";
import { GridContext, CellContext } from "./grid-context.ts";

export interface GridCellProps {
  /** Unique identifier for this cell */
  id: string;
  /** Row position (0-based) */
  row: number;
  /** Column position (0-based) */
  col: number;
  /** Number of rows this cell spans */
  rowSpan?: number;
  /** Number of columns this cell spans */
  colSpan?: number;
  /** Cell content */
  children: JSX.Element;
}

/**
 * Grid cell that registers with parent Grid for navigation
 * and provides focus context to child components.
 */
export function GridCell(props: GridCellProps) {
  const grid = useContext(GridContext);

  if (!grid) {
    throw new Error("GridCell must be used inside a Grid component");
  }

  // Register with parent grid on mount
  onMount(() => {
    grid.registerCell(props.id, {
      id: props.id,
      row: props.row,
      col: props.col,
      rowSpan: props.rowSpan,
      colSpan: props.colSpan,
    });
  });

  // Unregister on cleanup
  onCleanup(() => {
    grid.unregisterCell(props.id);
  });

  // Derive focus state from grid
  const isFocused = createMemo(() => grid.focusedId() === props.id);
  const isEditMode = createMemo(() => grid.editModeId() === props.id);

  // Create cell context value for child components
  const cellContext = {
    cellId: props.id,
    isFocused,
    isEditMode,
  };

  // Render children wrapped in CellContext
  return (
    <CellContext.Provider value={cellContext}>
      {props.children}
    </CellContext.Provider>
  );
}
