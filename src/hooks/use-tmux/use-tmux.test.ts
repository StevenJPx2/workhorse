/**
 * Tests for useTmux hook
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createRoot } from "solid-js";
import { useTmux } from "./use-tmux.ts";

// Mock the tmux session functions
const mockListSessions = mock(() => Promise.resolve([]));
const mockCreateSession = mock(() => Promise.resolve(null));
const mockKillSession = mock(() => Promise.resolve(true));
const mockSessionExists = mock(() => Promise.resolve(false));
const mockSendKeys = mock(() => Promise.resolve(true));
const mockCapturePane = mock(() => Promise.resolve("output"));
const mockIsTmuxAvailable = mock(() => Promise.resolve(true));

// Note: In a real test we'd mock the module, but for now we test the hook interface

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
        
        dispose();
      });
    });
  });

  describe("options", () => {
    test("accepts autoLoad option", () => {
      createRoot((dispose) => {
        // Should not throw
        const tmux = useTmux({ autoLoad: true });
        expect(tmux).toBeDefined();
        
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
      const onError = mock(() => {});
      
      createRoot((dispose) => {
        const tmux = useTmux({ onError });
        expect(tmux).toBeDefined();
        
        dispose();
      });
    });
  });
});
