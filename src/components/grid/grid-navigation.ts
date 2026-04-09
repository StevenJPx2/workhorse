/**
 * Grid navigation logic - pure functions for spatial movement
 */

import type { CellData } from "./grid-types.ts";
import type { Direction } from "./grid-context.ts";

/**
 * Find the cell occupying a given grid position
 */
export function getCellAt(
  cells: Map<string, CellData>,
  row: number,
  col: number,
): CellData | undefined {
  for (const cell of cells.values()) {
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
}

interface NeighborParams {
  cells: Map<string, CellData>;
  fromId: string;
  direction: Direction;
  rows: number;
  cols: number;
  wrap: boolean;
}

/**
 * Find the neighbor cell ID in a given direction
 */
export function getNeighbor(params: NeighborParams): string | null {
  const { cells, fromId, direction, rows, cols, wrap } = params;
  const from = cells.get(fromId);
  if (!from) return null;

  let targetRow = from.row;
  let targetCol = from.col;

  switch (direction) {
    case "up":
      targetRow = from.row - 1;
      if (targetRow < 0) {
        if (!wrap) return null;
        targetRow = rows - 1;
      }
      break;
    case "down":
      targetRow = from.row + from.rowSpan;
      if (targetRow >= rows) {
        if (!wrap) return null;
        targetRow = 0;
      }
      break;
    case "left":
      targetCol = from.col - 1;
      if (targetCol < 0) {
        if (!wrap) return null;
        targetCol = cols - 1;
      }
      break;
    case "right":
      targetCol = from.col + from.colSpan;
      if (targetCol >= cols) {
        if (!wrap) return null;
        targetCol = 0;
      }
      break;
  }

  const neighbor = getCellAt(cells, targetRow, targetCol);
  return neighbor?.id ?? null;
}