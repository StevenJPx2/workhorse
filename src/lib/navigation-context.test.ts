/**
 * Tests for navigation context lock system
 */

import { describe, it, expect } from "bun:test";
import { createNavigationValue, useNavigation } from "./navigation-context.ts";

describe("createNavigationValue", () => {
  describe("acquireLock", () => {
    it("creates a lock with the given ID", () => {
      const nav = createNavigationValue();
      const lock = nav.acquireLock("test-modal");

      expect(lock.id).toBe("test-modal");
    });

    it("returns same lock instance for same ID (idempotent)", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal-a");
      const lock2 = nav.acquireLock("modal-a");

      expect(lock1).toBe(lock2);
    });

    it("returns different lock instances for different IDs", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal-a");
      const lock2 = nav.acquireLock("modal-b");

      expect(lock1).not.toBe(lock2);
      expect(lock1.id).toBe("modal-a");
      expect(lock2.id).toBe("modal-b");
    });
  });

  describe("isLocked", () => {
    it("returns false when no locks acquired", () => {
      const nav = createNavigationValue();

      expect(nav.isLocked()).toBe(false);
    });

    it("returns true when a lock is acquired", () => {
      const nav = createNavigationValue();
      nav.acquireLock("modal");

      expect(nav.isLocked()).toBe(true);
    });

    it("returns false after all locks released", () => {
      const nav = createNavigationValue();
      const lock = nav.acquireLock("modal");

      expect(nav.isLocked()).toBe(true);

      lock.release();

      expect(nav.isLocked()).toBe(false);
    });

    it("returns true if any lock remains", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal-1");
      const lock2 = nav.acquireLock("modal-2");

      lock1.release();

      expect(nav.isLocked()).toBe(true);

      lock2.release();

      expect(nav.isLocked()).toBe(false);
    });
  });

  describe("hasControl (LIFO behavior)", () => {
    it("single lock has control", () => {
      const nav = createNavigationValue();
      const lock = nav.acquireLock("modal");

      expect(lock.hasControl()).toBe(true);
    });

    it("only latest lock has control (LIFO)", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal-1");
      const lock2 = nav.acquireLock("modal-2");

      expect(lock1.hasControl()).toBe(false);
      expect(lock2.hasControl()).toBe(true);
    });

    it("previous lock regains control when top is released", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal-1");
      const lock2 = nav.acquireLock("modal-2");

      expect(lock1.hasControl()).toBe(false);
      expect(lock2.hasControl()).toBe(true);

      lock2.release();

      expect(lock1.hasControl()).toBe(true);
    });

    it("releasing middle lock does not affect top lock control", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal-1");
      const lock2 = nav.acquireLock("modal-2");
      const lock3 = nav.acquireLock("modal-3");

      expect(lock3.hasControl()).toBe(true);
      expect(lock2.hasControl()).toBe(false);
      expect(lock1.hasControl()).toBe(false);

      // Release middle lock
      lock2.release();

      // Top still has control
      expect(lock3.hasControl()).toBe(true);
      expect(lock1.hasControl()).toBe(false);

      // Release top, bottom regains control
      lock3.release();
      expect(lock1.hasControl()).toBe(true);
    });

    it("three levels deep - correct LIFO unwinding", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("base");
      const lock2 = nav.acquireLock("dialog");
      const lock3 = nav.acquireLock("submenu");

      expect(lock3.hasControl()).toBe(true);

      lock3.release();
      expect(lock2.hasControl()).toBe(true);

      lock2.release();
      expect(lock1.hasControl()).toBe(true);

      lock1.release();
      expect(nav.isLocked()).toBe(false);
    });
  });

  describe("release", () => {
    it("release is idempotent (can call multiple times)", () => {
      const nav = createNavigationValue();
      const lock = nav.acquireLock("modal");

      lock.release();
      lock.release(); // Should not throw

      expect(nav.isLocked()).toBe(false);
    });

    it("after release, same ID can be acquired as new lock", () => {
      const nav = createNavigationValue();
      const lock1 = nav.acquireLock("modal");
      lock1.release();

      const lock2 = nav.acquireLock("modal");

      // New lock instance (not the released one)
      expect(lock2).not.toBe(lock1);
      expect(lock2.hasControl()).toBe(true);
    });
  });
});

describe("useNavigation", () => {
  it("returns no-op context when not in provider", () => {
    // useNavigation returns fallback when no context
    const nav = useNavigation();

    expect(nav.isLocked()).toBe(false);

    const lock = nav.acquireLock("test");
    expect(lock.id).toBe("test");
    expect(lock.hasControl()).toBe(true);

    // Release is a no-op but should not throw
    lock.release();
  });
});
