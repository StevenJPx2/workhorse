/**
 * Low-level `gh` CLI wrapper utilities.
 *
 * @module workhorse-plugin-github/gh-cli
 */

/**
 * Check if an error is a GitHub API rate limit error.
 * GitHub returns 403 with "rate limit" or "API rate limit exceeded" messages.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("api rate limit exceeded") ||
    message.includes("secondary rate limit")
  );
}

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
    stdin: options?.body
      ? new Response(JSON.stringify(options.body)).body
      : undefined,
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

/**
 * Download a file from a GitHub URL with authentication.
 * Uses `gh api` to handle auth for github.com URLs (including user-attachments).
 */
export async function downloadWithAuth(url: string): Promise<Buffer> {
  // For github.com URLs, use gh api which handles auth automatically
  if (new URL(url).hostname === "github.com") {
    // gh api can fetch any github.com URL with auth
    const proc = Bun.spawn(["gh", "api", url], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Failed to download ${url}: ${stderr}`);
    }

    return Buffer.from(stdout);
  }

  // For other URLs (CDN, etc.), use regular fetch
  const response = await fetch(url, {
    headers: { "User-Agent": "Workhorse-GitHub-Plugin/1.0" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download: ${response.status} ${response.statusText}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
