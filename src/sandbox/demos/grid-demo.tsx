/**
 * Grid component demo
 *
 * Spatial navigation with arrow keys.
 * Enter to activate a cell, Escape to deactivate.
 */

import { useTheme } from "../../lib/theme/index.ts";
import { Grid, GridCell } from "../../components/grid/index.ts";
import { Button } from "../../components/button/button.tsx";
import { Card } from "../../components/card/card.tsx";

export function GridDemo() {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" gap={2}>
      <text fg={theme().text.secondary}>Arrow keys to move between cells, Enter to activate:</text>

      <Grid rows={3} cols={3} wrap>
        <box flexDirection="column" gap={1}>
          {/* Row 0 */}
          <box flexDirection="row" gap={2}>
            <GridCell id="cell-0-0" row={0} col={0}>
              <Button label="Top Left" variant="primary" />
            </GridCell>
            <GridCell id="cell-0-1" row={0} col={1}>
              <Button label="Top Center" variant="success" />
            </GridCell>
            <GridCell id="cell-0-2" row={0} col={2}>
              <Button label="Top Right" variant="warning" />
            </GridCell>
          </box>

          {/* Row 1 */}
          <box flexDirection="row" gap={2}>
            <GridCell id="cell-1-0" row={1} col={0}>
              <Card title="A" width={16} height={5}>
                <text fg={theme().text.dim}>Cell</text>
              </Card>
            </GridCell>
            <GridCell id="cell-1-1" row={1} col={1}>
              <Card title="B" width={16} height={5}>
                <text fg={theme().text.dim}>Cell</text>
              </Card>
            </GridCell>
            <GridCell id="cell-1-2" row={1} col={2}>
              <Card title="C" width={16} height={5}>
                <text fg={theme().text.dim}>Cell</text>
              </Card>
            </GridCell>
          </box>

          {/* Row 2 */}
          <box flexDirection="row" gap={2}>
            <GridCell id="cell-2-0" row={2} col={0}>
              <Button label="Bottom Left" style="ghost" />
            </GridCell>
            <GridCell id="cell-2-1" row={2} col={1}>
              <Button label="Bottom Center" style="ghost" variant="danger" />
            </GridCell>
            <GridCell id="cell-2-2" row={2} col={2}>
              <Button label="Bottom Right" style="ghost" variant="success" />
            </GridCell>
          </box>
        </box>
      </Grid>
    </box>
  );
}
