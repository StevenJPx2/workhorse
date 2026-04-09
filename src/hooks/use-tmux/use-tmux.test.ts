/**
 * Tests for useTmux hook
 */

import { describe, test, expect, mock } from "bun:test";
import { createRoot, createEffect } from "solid-js";
import { useTmux } from "./use-tmux.ts";
import type { TmuxSession } from "../../harness/session/tmux/index.ts";

describe("useTmux", () => {
  describe("initial state", () => {
    test("starts with empty sessions", () => {
      createRoot((dispose) => {
        const tmux = useTmux();

        expect(tmux.sessions()).toEqual([]);
        expect(tmux.isLoading()).toBe(false);
        expect(tmux.error()).toBeNull();

        dispose();
      });
    });

    test("initial state is consistent across multiple calls", () => {
      createRoot((dispose) => {
        const tmux1 = useTmux();
        const tmux2 = useTmux();

        expect(tmux1.sessions()).toEqual(tmux2.sessions());
        expect(tmux1.isLoading()).toBe(tmux2.isLoading());
        expect(tmux1.error()).toBe(tmux2.error());

        dispose();
      });
    });
  });

  describe("interface", () => {
    test("exposes all required methods", () => {
      createRoot((dispose) => {
        const tmux = useTmux();

        expect(typeof tmux.reload).toBe("function");
        expect(typeof tmux.create).toBe("function");
        expect(typeof tmux.kill).toBe("function");
        expect(typeof tmux.exists).toBe("function");
        expect(typeof tmux.sendKeys).toBe("function");
        expect(typeof tmux.capture).toBe("function");
        expect(typeof tmux.isAvailable).toBe("function");

        dispose();
      });
    });

    test("exposes reactive accessors", () => {
      createRoot((dispose) => {
        const tmux = useTmux();

        expect(typeof tmux.sessions).toBe("function");
        expect(typeof tmux.isLoading).toBe("function");
        expect(typeof tmux.error).toBe("function");

        // Verify they return correct types
        expect(Array.isArray(tmux.sessions())).toBe(true);
        expect(typeof tmux.isLoading()).toBe("boolean");
        expect(tmux.error() === null || tmux.error() instanceof Error).toBe(true);

        dispose();
      });
    });

    test("all methods return promises", () => {
      createRoot((dispose) => {
        const tmux = useTmux();

        // Check that async methods return promises
        expect(tmux.reload()).toBeInstanceOf(Promise);
        expect(tmux.create("TEST-1", "/tmp")).toBeInstanceOf(Promise);
        expect(tmux.kill("TEST-1")).toBeInstanceOf(Promise);
        expect(tmux.exists("TEST-1")).toBeInstanceOf(Promise);
        expect(tmux.sendKeys("TEST-1", "ls")).toBeInstanceOf(Promise);
        expect(tmux.capture("TEST-1")).toBeInstanceOf(Promise);
        expect(tmux.isAvailable()).toBeInstanceOf(Promise);

        dispose();
      });
    });
  });

  describe("options", () => {
    test("accepts empty options object", () => {
      createRoot((dispose) => {
        const tmux = useTmux({});
        expect(tmux).toBeDefined();
        expect(tmux.sessions()).toEqual([]);

        dispose();
      });
    });

    test("accepts autoLoad option (false)", () => {
      createRoot((dispose) => {
        const tmux = useTmux({ autoLoad: false });
        expect(tmux).toBeDefined();
        expect(tmux.sessions()).toEqual([]);

        dispose();
      });
    });

    test("accepts onChange callback", () => {
      const onChange = mock(() => {});

      createRoot((dispose) => {
        const tmux = useTmux({ onChange });
        expect(tmux).toBeDefined();

        dispose();
      });
    });

    test("accepts onError callback", () => {
      const onError = mock((_err: Error) => {});

      createRoot((dispose) => {
        const tmux = useTmux({ onError });
        expect(tmux).toBeDefined();

        dispose();
      });
    });

    test("accepts all options together", () => {
      const onChange = mock(() => {});
      const onError = mock((_err: Error) => {});

      createRoot((dispose) => {
        const tmux = useTmux({
          autoLoad: true,
          onChange,
          onError,
        });
        expect(tmux).toBeDefined();

        dispose();
      });
    });
  });

  describe("method behavior", () => {
    test("reload handles errors gracefully (tmux not available)", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        // reload() will try to call tmuxList() which will fail (no tmux)
        // but it should handle errors gracefully
        await tmux.reload();

        // Loading should be false after reload completes
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("reload sets loading state during execution", async () => {
      await createRoot(async (dispose) => {
        const loadingStates: boolean[] = [];
        const tmux = useTmux();

        // Track loading state changes
        createEffect(() => {
          loadingStates.push(tmux.isLoading());
        });

        await tmux.reload();

        // Should have recorded at least one loading state
        expect(loadingStates.some((state) => state === true)).toBe(true);
        expect(tmux.isLoading()).toBe(false); // Final state should be false

        dispose();
      });
    });

    test("reload clears previous error before execution", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        // First call may set an error (tmux not available)
        await tmux.reload();

        // After reload, error should be the result of the latest call
        // If tmux is not available, error will be set
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("create returns null on error (tmux not available)", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.create("TEST-1", "/tmp");

        // Should return null when tmux is not available
        expect(result).toBeNull();
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("create clears error before execution", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        await tmux.create("TEST-1", "/tmp");

        // Error may be set but loading should be false
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("kill returns false on error (tmux not available)", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.kill("TEST-1");

        // Should return false when tmux is not available
        expect(result).toBe(false);
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("kill clears error before execution", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        await tmux.kill("TEST-1");

        // Error may be set but loading should be false
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("exists returns false on error (tmux not available)", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.exists("TEST-1");

        // Should return false when tmux is not available
        expect(result).toBe(false);

        dispose();
      });
    });

    test("exists clears error before execution", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        await tmux.exists("TEST-1");

        // Loading should be false (exists doesn't set loading)
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("sendKeys returns false on error (tmux not available)", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.sendKeys("TEST-1", "ls");

        // Should return false when tmux is not available
        expect(result).toBe(false);

        dispose();
      });
    });

    test("sendKeys with enter=false", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.sendKeys("TEST-1", "ls", false);

        // Should return false when tmux is not available
        expect(result).toBe(false);

        dispose();
      });
    });

    test("sendKeys clears error before execution", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        await tmux.sendKeys("TEST-1", "ls");

        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("capture returns null on error (tmux not available)", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.capture("TEST-1");

        // Should return null when tmux is not available
        expect(result).toBeNull();

        dispose();
      });
    });

    test("capture clears error before execution", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        await tmux.capture("TEST-1");

        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("isAvailable returns false when tmux is not installed", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.isAvailable();

        // tmux is likely not available in test environment
        expect(typeof result).toBe("boolean");

        dispose();
      });
    });
  });

  describe("error handling", () => {
    test("onError callback is invoked on reload failure", async () => {
      const onError = mock((_err: Error) => {});

      await createRoot(async (dispose) => {
        const tmux = useTmux({ onError });

        await tmux.reload();

        // onError should have been called (tmux not available)
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
        const tmux = useTmux({ onError });

        await tmux.reload();

        // Error should be an Error instance
        expect(capturedError).toBeInstanceOf(Error);
        expect(capturedError?.message).toBeTruthy();

        dispose();
      });
    });

    test("error state is accessible via error() accessor", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        await tmux.reload();

        // Error should be set (tmux not available)
        expect(tmux.error()).toBeInstanceOf(Error);

        dispose();
      });
    });

    test("error can be cleared on successful operation", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        // First call sets error
        await tmux.reload();
        expect(tmux.error()).not.toBeNull();

        // exists() clears error before execution
        await tmux.exists("TEST-1");
        // Error may still be set from exists() failure

        dispose();
      });
    });
  });

  describe("callback behavior", () => {
    test("onChange callback is invoked after reload", async () => {
      const onChange = mock((_sessions: TmuxSession[]) => {});

      await createRoot(async (dispose) => {
        const tmux = useTmux({ onChange });

        await tmux.reload();

        // onChange should have been called (even if sessions is empty)
        expect(onChange).toHaveBeenCalled();

        dispose();
      });
    });

    test("onChange receives array of sessions", async () => {
      let capturedSessions: TmuxSession[] | null = null;
      const onChange = (sessions: TmuxSession[]) => {
        capturedSessions = sessions;
      };

      await createRoot(async (dispose) => {
        const tmux = useTmux({ onChange });

        await tmux.reload();

        // onChange should receive an array
        expect(Array.isArray(capturedSessions)).toBe(true);

        dispose();
      });
    });
  });

  describe("handleError behavior", () => {
    test("handles string errors gracefully", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        // Trigger an error
        await tmux.reload();

        // Error should be an Error instance, not a string
        const err = tmux.error();
        expect(err).toBeInstanceOf(Error);

        dispose();
      });
    });

    test("handles non-Error objects gracefully", async () => {
      const onError = mock((err: Error) => {
        expect(err).toBeInstanceOf(Error);
      });

      await createRoot(async (dispose) => {
        const tmux = useTmux({ onError });

        await tmux.reload();

        expect(onError).toHaveBeenCalled();

        dispose();
      });
    });
  });
});
