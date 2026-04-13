import { describe, test, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useWorktree } from "../use-worktree.ts";

describe("useWorktree", () => {
  describe("initial state", () => {
    test("starts with empty worktrees", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo" });

        expect(wt.worktrees()).toEqual([]);
        expect(wt.isLoading()).toBe(false);
        expect(wt.error()).toBeNull();

        dispose();
      });
    });

    test("initial state is consistent across multiple calls", () => {
      createRoot((dispose) => {
        const wt1 = useWorktree({ repoPath: "/test/repo" });
        const wt2 = useWorktree({ repoPath: "/test/repo" });

        expect(wt1.worktrees()).toEqual(wt2.worktrees());
        expect(wt1.isLoading()).toBe(wt2.isLoading());
        expect(wt1.error()).toBe(wt2.error());

        dispose();
      });
    });

    test("accepts no repoPath (will throw on operations)", () => {
      createRoot((dispose) => {
        const wt = useWorktree();
        expect(wt).toBeDefined();
        expect(wt.worktrees()).toEqual([]);

        dispose();
      });
    });
  });

  describe("interface", () => {
    test("exposes all required methods", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo" });

        expect(typeof wt.reload).toBe("function");
        expect(typeof wt.create).toBe("function");
        expect(typeof wt.remove).toBe("function");
        expect(typeof wt.exists).toBe("function");
        expect(typeof wt.get).toBe("function");

        dispose();
      });
    });

    test("exposes reactive accessors", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo" });

        expect(typeof wt.worktrees).toBe("function");
        expect(typeof wt.isLoading).toBe("function");
        expect(typeof wt.error).toBe("function");

        expect(Array.isArray(wt.worktrees())).toBe(true);
        expect(typeof wt.isLoading()).toBe("boolean");
        expect(wt.error() === null || wt.error() instanceof Error).toBe(true);

        dispose();
      });
    });

    test("all methods return promises", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo" });

        expect(wt.reload()).toBeInstanceOf(Promise);
        expect(wt.create("TEST-1")).toBeInstanceOf(Promise);
        expect(wt.remove("TEST-1")).toBeInstanceOf(Promise);
        expect(wt.exists("TEST-1")).toBeInstanceOf(Promise);
        expect(wt.get("TEST-1")).toBeInstanceOf(Promise);

        dispose();
      });
    });
  });

  describe("options", () => {
    test("accepts empty options object", () => {
      createRoot((dispose) => {
        const wt = useWorktree({});
        expect(wt).toBeDefined();
        expect(wt.worktrees()).toEqual([]);

        dispose();
      });
    });

    test("accepts repoPath option", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo" });
        expect(wt).toBeDefined();
        expect(wt.worktrees()).toEqual([]);

        dispose();
      });
    });

    test("accepts autoLoad option (requires repoPath)", () => {
      createRoot((dispose) => {
        const wt = useWorktree({
          repoPath: "/test/repo",
          autoLoad: true,
        });
        expect(wt).toBeDefined();
        expect(wt.worktrees()).toEqual([]);

        dispose();
      });
    });

    test("accepts onChange callback", () => {
      const onChange = mock(() => {});

      createRoot((dispose) => {
        const wt = useWorktree({
          repoPath: "/test/repo",
          onChange,
        });
        expect(wt).toBeDefined();

        dispose();
      });
    });

    test("accepts onError callback", () => {
      const onError = mock((_err: Error) => {});

      createRoot((dispose) => {
        const wt = useWorktree({
          repoPath: "/test/repo",
          onError,
        });
        expect(wt).toBeDefined();

        dispose();
      });
    });

    test("accepts all options together", () => {
      const onChange = mock(() => {});
      const onError = mock((_err: Error) => {});

      createRoot((dispose) => {
        const wt = useWorktree({
          repoPath: "/test/repo",
          autoLoad: true,
          onChange,
          onError,
        });
        expect(wt).toBeDefined();

        dispose();
      });
    });
  });
});
