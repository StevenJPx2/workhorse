// Sandbox I/O boundary. The engine never touches @cloudflare/sandbox —
// the worker passes a Driver backed by it; tests pass a mock.

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Driver {
  exec(command: string, opts?: { timeout?: number }): Promise<ExecResult>;
  writeFile(path: string, content: string): Promise<void>;
  /** Returns null when the file doesn't exist. */
  readFile(path: string): Promise<string | null>;
}
