/**
 * Helper utilities for useAgent hook
 */

import type { UseAgentOptions } from "./types.ts";

export type ResolvedOptions = {
  getRepoPath: () => string;
  resolveJiraCloudId: () => string | undefined;
  handleError: (err: unknown) => Error;
};

export function createResolvers(
  options: UseAgentOptions,
  setError: (err: Error | null) => void,
): ResolvedOptions {
  const resolveRepoPath = (): string | undefined => {
    const rp = options.repoPath;
    return typeof rp === "function" ? rp() : rp;
  };

  const resolveJiraCloudId = (): string | undefined => {
    const cid = options.jiraCloudId;
    return typeof cid === "function" ? cid() : cid;
  };

  const getRepoPath = (): string => {
    const repoPath = resolveRepoPath();
    if (!repoPath) {
      throw new Error("repoPath is required for agent operations");
    }
    return repoPath;
  };

  const handleError = (err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    options.onError?.(e);
    return e;
  };

  return { getRepoPath, resolveJiraCloudId, handleError };
}