import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { GlobalContext } from "#orchestrator";
import { type ScriptT, serializeFrontMatter } from "#schema";

import type { Service } from "../base";
import { discoverScripts, SCRIPTS_DIR } from "./discover";
import { scriptTools, type WriteScript } from "./tools";

export class ScriptService implements Service {
  readonly name = "scripts";

  private readonly dir: string;
  private scripts: readonly ScriptT[] = [];

  constructor(
    private readonly cwd: string = process.cwd(),
    private readonly home: string = homedir(),
  ) {
    this.dir = join(cwd, SCRIPTS_DIR);
  }

  async setup(context: GlobalContext): Promise<void> {
    this.refresh();

    await Promise.all(
      scriptTools(this).map((tool) =>
        context.hooks.callHook("tools:register", { tool }),
      ),
    );
  }

  list(): readonly ScriptT[] {
    return this.scripts;
  }

  teardown(): void {
    this.scripts = [];
  }

  private refresh(): void {
    this.scripts = discoverScripts(this.cwd, this.home);
  }

  readonly write: WriteScript = ({ args, command, description, name }) => {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(
      join(this.dir, `${name}.sh`),
      serializeFrontMatter({ args, command, description }),
    );
    this.refresh();
  };
}
