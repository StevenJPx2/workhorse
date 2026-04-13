/**
 * Helper for wrapping async GitHub API calls with connection management
 * and error handling.
 */

export async function withConnection<T>(
  ensureConnected: () => Promise<void>,
  setError: (err: Error | null) => void,
  onError: ((err: Error) => void) | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  await ensureConnected();
  try {
    setError(null);
    return await operation();
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    onError?.(e);
    throw e;
  }
}
