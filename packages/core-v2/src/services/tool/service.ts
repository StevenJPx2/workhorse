import type { GlobalContext } from "#orchestrator";
import type { AnyTool } from "#schema";

import type { Service } from "../base";

export class ToolService implements Service {
  readonly name = "tools";

  private readonly tools: AnyTool[] = [];

  setup(context: GlobalContext): void {
    context.hooks.hook("tools:register", ({ tool }) => {
      this.tools.push(tool);
    });
  }

  list(): readonly AnyTool[] {
    return this.tools;
  }

  teardown(): void {
    this.tools.length = 0;
  }
}
