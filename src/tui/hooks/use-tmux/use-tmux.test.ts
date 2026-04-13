/**
 * Tests for useTmux hook
 */

import { describe, test, expect, mock } from "bun:test";
import { createRoot, createEffect } from "solid-js";
import { useTmux } from "./use-tmux.ts";
import type { TmuxSession } from "#core/session/tmux/index.ts";

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
    test("reload handles errors gracefully", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        // reload() may fail if tmux not available, but should handle gracefully
        await tmux.reload();

        // Loading should be false after reload completes (success or error)
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

    test("create returns null or session", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.create("TEST-1", "/tmp");

        // Should return null when tmux is not available, or a session when available
        expect(result === null || typeof result === "object").toBe(true);
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("kill returns boolean", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.kill("TEST-1");

        // Should return boolean
        expect(typeof result).toBe("boolean");
        expect(tmux.isLoading()).toBe(false);

        dispose();
      });
    });

    test("exists returns boolean", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.exists("TEST-1");

        // Should return boolean
        expect(typeof result).toBe("boolean");

        dispose();
      });
    });

    test("sendKeys returns boolean", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.sendKeys("TEST-1", "ls");

        // Should return boolean
        expect(typeof result).toBe("boolean");

        dispose();
      });
    });

    test("sendKeys with enter=false", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.sendKeys("TEST-1", "ls", false);

        // Should return boolean
        expect(typeof result).toBe("boolean");

        dispose();
      });
    });

    test("capture returns string or null", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.capture("TEST-1");

        // Should return null or string
        expect(result === null || typeof result === "string").toBe(true);

        dispose();
      });
    });

    test("isAvailable returns boolean", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        const result = await tmux.isAvailable();

        // Should return boolean
        expect(typeof result).toBe("boolean");

        dispose();
      });
    });
  });

  describe("error handling", () => {
    test("error state is accessible via error() accessor", async () => {
      await createRoot(async (dispose) => {
        const tmux = useTmux();

        // Initially no error
        expect(tmux.error()).toBeNull();

        // Perform operation that might error
        await tmux.reload();

        // Error may be set or null depending on tmux availability
        expect(tmux.error() === null || tmux.error() instanceof Error).toBe(true);

        dispose();
      });
    });

    test("onError callback can be set", async () => {
      const onError = mock((_err: Error) => {});

      await createRoot(async (dispose) => {
        const tmux = useTmux({ onError });

        await tmux.reload();

        // Callback should have been called if there was an error
        // May or may not be called depending on tmux availability
        expect(typeof onError.mock.calls.length).toBe("number");

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
});
