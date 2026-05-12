/**
 * Low-level `gh` CLI wrapper utilities.
 *
 * @module @jiratown/plugin-github/gh-cli
 */

/** Run a gh CLI command and return stdout */
export async function gh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`gh ${args[0]} failed: ${stderr || stdout}`);
  }

  return stdout;
}

/** Run gh api and parse JSON response */
export async function api<T>(
  endpoint: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const args = ["api", endpoint];

  if (options?.method) {
    args.push("--method", options.method);
  }

  if (options?.body) {
    args.push("--input", "-");
  }

  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: options?.body ? new Response(JSON.stringify(options.body)).body : undefined,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`gh api ${endpoint} failed: ${stderr || stdout}`);
  }

  return JSON.parse(stdout) as T;
}
