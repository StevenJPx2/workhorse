import { glob, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { defu } from "defu";
import { parse } from "smol-toml";

import { ResolvedConfig, type ResolvedConfigT } from "./resolved";

/**
 * Glob every TOML file under one config root and mirror the directory as a
 * plain object: each path segment becomes a key and the parsed file is the leaf
 * (`config.toml` → `config`, `workflows/ralph.toml` → `workflows.ralph`).
 * Whether that shape is valid is the schema's job, not this function's.
 */
async function assembleRoot(root: string): Promise<Record<string, unknown>> {
  const tree: Record<string, unknown> = {};

  for await (const rel of glob("**/*.toml", { cwd: root })) {
    const raw = await readFile(join(root, rel), "utf8").then((text) =>
      parse(text),
    );

    const keys = rel.replace(/\.toml$/u, "").split("/");
    let node = tree;

    for (const key of keys.slice(0, -1)) {
      node[key] ??= {};
      node = node[key] as Record<string, unknown>;
    }

    node[keys.at(-1) ?? rel] = raw;
  }

  return tree;
}

/**
 * Load the personal `~/.config/workhorse` tree, then the project `.workhorse`
 * tree, and merge them with defu — the project layer wins.
 */
export function loadConfig(
  cwd = process.cwd(),
  home = homedir(),
): Promise<ResolvedConfigT> {
  return Promise.all([
    assembleRoot(join(home, ".config", "workhorse")),
    assembleRoot(join(cwd, ".workhorse")),
  ]).then(([personal, project]) =>
    ResolvedConfig.parse(defu(project, personal)),
  );
}
