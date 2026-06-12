import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { GlobalContext } from "#orchestrator";
import type { ScriptT } from "#schema";

import type { Service } from "../base";
import { discoverScripts, encodeArgs, SCRIPTS_DIR } from "./discover";
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
      scriptTools(() => this.list(), this.write).map((tool) =>
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

  private readonly write: WriteScript = ({
    args,
    command,
    description,
    name,
  }) => {
    const header: string[] = [];

    if (description !== undefined) {
      header.push(`# ${description}`);
    }

    if (args !== undefined) {
      header.push(encodeArgs(args));
    }

    mkdirSync(this.dir, { recursive: true });

    writeFileSync(
      join(this.dir, `${name}.sh`),
      [...header, command].join("\n"),
    );
    this.refresh();
  };
}
