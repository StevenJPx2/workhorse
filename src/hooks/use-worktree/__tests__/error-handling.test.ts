import { describe, test, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useWorktree } from "../use-worktree.ts";

describe("useWorktree", () => {
  describe("error handling", () => {
    test("onError callback is invoked on reload failure", async () => {
      const onError = mock((_err: Error) => {});

      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo", onError });

        await wt.reload();

        expect(onError).toHaveBeenCalled();

        dispose();
      });
    });

    test("onError callback receives Error instance", async () => {
      let capturedError: Error | null = null;
      const onError = (err: Error) => {
        capturedError = err;
      };

      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo", onError });

        await wt.reload();

        expect(capturedError).toBeInstanceOf(Error);
        expect(capturedError?.message).toBeTruthy();

        dispose();
      });
    });

    test("error state is accessible via error() accessor", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        await wt.reload();

        expect(wt.error()).toBeInstanceOf(Error);

        dispose();
      });
    });
  });

  describe("handleError behavior", () => {
    test("handles string errors gracefully", async () => {
      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo" });

        await wt.reload();

        const err = wt.error();
        expect(err).toBeInstanceOf(Error);

        dispose();
      });
    });

    test("handles non-Error objects gracefully", async () => {
      const onError = mock((err: Error) => {
        expect(err).toBeInstanceOf(Error);
      });

      await createRoot(async (dispose) => {
        const wt = useWorktree({ repoPath: "/nonexistent/repo", onError });

        await wt.reload();

        expect(onError).toHaveBeenCalled();

        dispose();
      });
    });
  });
});