// Fake SandboxHandle — the container double.
//
// SandboxHandle is only three methods (exec/readFile/writeFile), so a tool
// that "runs in the container" is fully testable in-process. The fake keeps an
// in-memory filesystem and a scriptable exec table, and RECORDS every call so
// a test can assert the command a tool actually built (the usual bug: bad
// quoting or a dropped flag, not bad logic).

import type { SandboxHandle } from "@workhorse/api";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecCall {
  command: string;
  timeout?: number;
}

/**
 * How to answer an exec: a literal result, a function of the command, or a
 * bare string (treated as stdout with exit 0).
 */
export type ExecResponder = string | Partial<ExecResult> | ((command: string) => string | Partial<ExecResult>);

export interface FakeSandboxOptions {
  /**
   * Seed the in-memory filesystem: path → contents. readFile returns null for
   * anything absent (matching the real handle).
   */
  files?: Record<string, string>;
  /**
   * Scripted exec responses. Keys are matched as SUBSTRINGS of the command,
   * longest key first — so a specific match wins over a general one. Anything
   * unmatched falls through to `defaultExec`.
   */
  exec?: Record<string, ExecResponder>;
  /** Answer for commands no `exec` key matches. Default: exit 0, empty output. */
  defaultExec?: ExecResponder;
}

export interface FakeSandbox extends SandboxHandle {
  /** Every exec, in order. */
  readonly execCalls: ExecCall[];
  /** Every writeFile, in order. */
  readonly writes: Array<{ path: string; content: string }>;
  /** Current in-memory filesystem. */
  readonly files: Map<string, string>;
  /** The single command executed — throws when none or many (assertion sugar). */
  lastCommand(): string;
  /** Did any exec contain this substring? */
  ranCommandContaining(fragment: string): boolean;
}

function normalize(r: string | Partial<ExecResult>): ExecResult {
  if (typeof r === "string") return { exitCode: 0, stdout: r, stderr: "" };
  return { exitCode: r.exitCode ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * Build a fake container. Everything is optional — `fakeSandbox()` alone gives
 * a sandbox where every command succeeds silently and every file is missing.
 */
export function fakeSandbox(options: FakeSandboxOptions = {}): FakeSandbox {
  const execCalls: ExecCall[] = [];
  const writes: Array<{ path: string; content: string }> = [];
  const files = new Map<string, string>(Object.entries(options.files ?? {}));

  // Longest-first so a specific pattern beats a general one.
  const patterns = Object.entries(options.exec ?? {}).sort((a, b) => b[0].length - a[0].length);

  const resolve = (command: string): ExecResult => {
    for (const [fragment, responder] of patterns) {
      if (!command.includes(fragment)) continue;
      return normalize(typeof responder === "function" ? responder(command) : responder);
    }
    const fallback = options.defaultExec ?? { exitCode: 0, stdout: "", stderr: "" };
    return normalize(typeof fallback === "function" ? fallback(command) : fallback);
  };

  return {
    execCalls,
    writes,
    files,

    async exec(command, opts) {
      execCalls.push({ command, timeout: opts?.timeout });
      return resolve(command);
    },

    async readFile(path) {
      return files.get(path) ?? null;
    },

    async writeFile(path, content) {
      writes.push({ path, content });
      files.set(path, content);
    },

    lastCommand() {
      if (!execCalls.length) throw new Error("fakeSandbox: no exec calls were made");
      return execCalls[execCalls.length - 1].command;
    },

    ranCommandContaining(fragment) {
      return execCalls.some((c) => c.command.includes(fragment));
    },
  };
}
