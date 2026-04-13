/**
 * Grid type definitions
 */

export interface GridProps {
  /** Number of rows in the grid */
  rows: number;
  /** Number of columns in the grid */
  cols: number;
  /** Whether to wrap navigation at edges */
  wrap?: boolean;
  /** Grid content (GridCells wrapped in layout elements) */
  children: import("solid-js").JSX.Element;
}

export interface CellData {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}
