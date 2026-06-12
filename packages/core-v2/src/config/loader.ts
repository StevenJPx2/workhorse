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
function assembleRoot(root: string): Promise<Record<string, unknown>> {
  return Array.fromAsync(glob("**/*.toml", { cwd: root }))
    .then((files) =>
      Promise.all(
        files.map((rel) =>
          readFile(join(root, rel), "utf8").then((text) => ({
            raw: parse(text) as Record<string, unknown>,
            rel,
          })),
        ),
      ),
    )
    .then((entries) => {
      const tree: Record<string, unknown> = {};

      for (const { rel, raw } of entries) {
        const keys = rel.replace(/\.toml$/u, "").split("/");
        let node = tree;

        for (const key of keys.slice(0, -1)) {
          node[key] ??= {};
          node = node[key] as Record<string, unknown>;
        }

        node[keys.at(-1) ?? rel] = raw;
      }

      return tree;
    });
}

/**
 * Load the global `~/.config/workhorse` tree, then the project `.workhorse`
 * tree, and merge them with defu — the project layer wins.
 */
export function loadConfig(cwd = process.cwd()): Promise<ResolvedConfigT> {
  return Promise.all([
    assembleRoot(join(homedir(), ".config", "workhorse")),
    assembleRoot(join(cwd, ".workhorse")),
  ]).then(([global, project]) => ResolvedConfig.parse(defu(project, global)));
}
