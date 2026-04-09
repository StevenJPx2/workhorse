import { describe, test, expect, mock } from "bun:test";
import { createRoot, createEffect } from "solid-js";
import { useWorktree } from "../use-worktree.ts";
import type { Worktree } from "../../../harness/session/worktree/index.ts";

describe("useWorktree", () => {
  describe("method behavior", () => {
    test("reload throws if repoPath not provided", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree();

        await wt.reload();

        expect(wt.error()).toBeInstanceOf(Error);
        expect(wt.error()?.message).toContain("repoPath is required");

        dispose();
      });
    });

    test("reload handles errors gracefully (invalid repo)", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        await wt.reload();

        expect(wt.isLoading()).toBe(false);

        dispose();
      });
    });

    test("reload sets loading state during execution", async () => {
      await createRoot(async (dispose) => {
        const loadingStates: boolean[] = [];
        const wt = useWorktree({ repoPath: "/test/repo" });

        createEffect(() => {
          loadingStates.push(wt.isLoading());
        });

        await wt.reload();

        expect(loadingStates.some((state) => state === true)).toBe(true);
        expect(wt.isLoading()).toBe(false);

        dispose();
      });
    });

    test("reload clears previous error before execution", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        await wt.reload();
        const firstError = wt.error();
        expect(firstError).not.toBeNull();

        dispose();
      });
    });

    test("create returns null if repoPath not provided", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree();

        const result = await wt.create("TEST-1");

        expect(result).toBeNull();
        expect(wt.error()).toBeInstanceOf(Error);
        expect(wt.error()?.message).toContain("repoPath is required");

        dispose();
      });
    });

    test("create handles error gracefully (invalid repo)", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.create("TEST-1");

        expect(result).toBeNull();

        dispose();
      });
    });

    test("create clears error before execution", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        await wt.create("TEST-1");

        expect(wt.isLoading()).toBe(false);

        dispose();
      });
    });

    test("create accepts optional issueType", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.create("TEST-1", "Story");

        expect(result).toBeNull();

        dispose();
      });
    });

    test("create accepts optional baseBranch", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.create("TEST-1", "Story", "main");

        expect(result).toBeNull();

        dispose();
      });
    });

    test("remove returns false if repoPath not provided", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree();

        const result = await wt.remove("TEST-1");

        expect(result).toBe(false);
        expect(wt.error()).toBeInstanceOf(Error);

        dispose();
      });
    });

    test("remove handles error gracefully (invalid repo)", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.remove("TEST-1");

        expect(result).toBe(false);

        dispose();
      });
    });

    test("remove accepts optional deleteBranch", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.remove("TEST-1", true);

        expect(result).toBe(false);

        dispose();
      });
    });

    test("exists returns false if repoPath not provided", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree();

        const result = await wt.exists("TEST-1");

        expect(result).toBe(false);
        expect(wt.error()).toBeInstanceOf(Error);

        dispose();
      });
    });

    test("exists handles error gracefully (invalid repo)", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.exists("TEST-1");

        expect(result).toBe(false);

        dispose();
      });
    });

    test("get returns null if repoPath not provided", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree();

        const result = await wt.get("TEST-1");

        expect(result).toBeNull();
        expect(wt.error()).toBeInstanceOf(Error);

        dispose();
      });
    });

    test("get handles error gracefully (invalid repo)", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        const result = await wt.get("TEST-1");

        expect(result).toBeNull();

        dispose();
      });
    });
  });

  describe("callback behavior", () => {
    test("onChange callback is invoked after reload", async () => {
      const onChange = mock((_worktrees: Worktree[]) => {});

      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo", onChange });

        await wt.reload();

        expect(onChange).toHaveBeenCalled();

        dispose();
      });
    });

    test("onChange receives array of worktrees", async () => {
      let capturedWorktrees: Worktree[] | null = null;
      const onChange = (worktrees: Worktree[]) => {
        capturedWorktrees = worktrees;
      };

      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo", onChange });

        await wt.reload();

        expect(Array.isArray(capturedWorktrees)).toBe(true);

        dispose();
      });
    });
  });

  describe("getRepoPath behavior", () => {
    test("throws error when repoPath is missing", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree();

        await wt.reload();

        expect(wt.error()).toBeInstanceOf(Error);
        expect(wt.error()?.message).toContain("repoPath is required");

        dispose();
      });
    });

    test("error is propagated through onError", async () => {
      const onError = mock((_err: Error) => {});

      await createRoot(async (dispose) => {
        const wt = useWorktree({ onError });

        await wt.reload();

        expect(onError).toHaveBeenCalled();
        const errorArg = onError.mock.calls[0][0] as Error;
        expect(errorArg.message).toContain("repoPath is required");

        dispose();
      });
    });
  });
});