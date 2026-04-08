/**
 * Tests for useWorktree hook
 */

import { describe, test, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useWorktree } from "./use-worktree.ts";

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
        
        dispose();
      });
    });
  });

  describe("options", () => {
    test("accepts repoPath option", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ repoPath: "/test/repo" });
        expect(wt).toBeDefined();
        
        dispose();
      });
    });

    test("accepts autoLoad option", () => {
      createRoot((dispose) => {
        const wt = useWorktree({ 
          repoPath: "/test/repo",
          autoLoad: true 
        });
        expect(wt).toBeDefined();
        
        dispose();
      });
    });

    test("accepts onChange callback", () => {
      const onChange = mock(() => {});
      
      createRoot((dispose) => {
        const wt = useWorktree({ 
          repoPath: "/test/repo",
          onChange 
        });
        expect(wt).toBeDefined();
        
        dispose();
      });
    });

    test("accepts onError callback", () => {
      const onError = mock(() => {});
      
      createRoot((dispose) => {
        const wt = useWorktree({ 
          repoPath: "/test/repo",
          onError 
        });
        expect(wt).toBeDefined();
        
        dispose();
      });
    });
  });

  describe("error handling", () => {
    test("throws if repoPath not provided on operation", async () => {
      let capturedError: Error | null = null;
      
      await createRoot(async (dispose) => {
        const wt = useWorktree({
          onError: (err) => { capturedError = err; }
        });
        
        // This should set error since repoPath is missing
        await wt.reload();
        
        expect(wt.error()).not.toBeNull();
        expect(wt.error()?.message).toContain("repoPath is required");
        
        dispose();
      });
    });
  });
});
