/**
 * Shared scaffolding for the per-service smoke scripts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHooks } from "hookable";
import { bold, cyan, dim, green } from "yoctocolors";

import { ResolvedConfig } from "#config";
import type { Hooks } from "#hooks";
import type { AnyTool } from "#schema";
import type { WorkflowContext } from "#workflow";

/** A throwaway project root that is cleaned up when {@link dispose} runs. */
export interface Sandbox {
  cwd: string;
  home: string;
  dispose(): void;
}

export function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "workhorse-smoke-"));
  return {
    cwd: join(root, "project"),
    dispose: () => rmSync(root, { force: true, recursive: true }),
    home: join(root, "home"),
  };
}

/**
 * Build a live {@link WorkflowContext}.
 */
export function context(cwd: string): WorkflowContext {
  return {
    config: ResolvedConfig.parse({}),
    cwd,
    hooks: createHooks<Hooks>(),
  };
}

/** Collects every tool a service contributes over `tools:register`. */
export function toolSink(ctx: WorkflowContext): Map<string, AnyTool> {
  const tools = new Map<string, AnyTool>();
  ctx.hooks.hook("tools:register", ({ tool }) => {
    tools.set(tool.name, tool);
  });
  return tools;
}

/* ---------------------------------------------------------------- narration */

/** Tiny console narrator — everything goes to stderr, keeping stdout clean. */
export function narrator(title: string) {
  log(`\n${bold(cyan(`▶ ${title}`))}`);

  return {
    /** A captioned blob of data (pretty-printed). */
    detail(label: string, value: unknown) {
      log(dim(`  ${label}:`));
      for (const line of (typeof value === "string"
        ? value
        : JSON.stringify(value, undefined, 2)
      ).split("\n")) {
        log(`    ${line}`);
      }
    },
    /** A finished section. */
    done(message: string) {
      log(`  ${green("✓")} ${message}\n`);
    },
    /** A single narrated step. */
    step(message: string) {
      log(`  ${cyan("·")} ${message}`);
    },
  };
}

function log(line: string): void {
  process.stderr.write(`${line}\n`);
}
