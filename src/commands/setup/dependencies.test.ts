/**
 * Tests for setup dependencies
 */

import { describe, expect, it } from "bun:test";
import { checkDependency, checkAllDependencies, DEPENDENCIES, type Dependency } from "./dependencies.ts";

describe("dependencies", () => {
  describe("DEPENDENCIES constant", () => {
    it("should export DEPENDENCIES array", () => {
      expect(Array.isArray(DEPENDENCIES)).toBe(true);
    });

    it("should have required dependencies defined", () => {
      expect(DEPENDENCIES.length).toBeGreaterThan(0);
      
      const names = DEPENDENCIES.map((d) => d.name);
      expect(names).toContain("Bun");
    });

    it("should have valid dependency structure", () => {
      for (const dep of DEPENDENCIES) {
        expect(dep.name).toBeTruthy();
        expect(typeof dep.name).toBe("string");
        expect(dep.command).toBeTruthy();
        expect(typeof dep.command).toBe("string");
        expect(Array.isArray(dep.checkArgs)).toBe(true);
        // checkArgs should be strings
        for (const arg of dep.checkArgs) {
          expect(typeof arg).toBe("string");
        }
      }
    });

    it("should have Bun with correct configuration", () => {
      const bunDep = DEPENDENCIES.find((d) => d.name === "Bun");
      expect(bunDep).toBeDefined();
      expect(bunDep?.command).toBe("bun");
      expect(bunDep?.checkArgs).toContain("--version");
    });

    it("should have optional installHint as string if present", () => {
      for (const dep of DEPENDENCIES) {
        if (dep.installHint !== undefined) {
          expect(typeof dep.installHint).toBe("string");
        }
      }
    });
  });

  describe("Dependency type", () => {
    it("should accept valid Dependency structure", () => {
      const dep: Dependency = {
        name: "Test",
        command: "test",
        checkArgs: ["--version"],
        installHint: "Install test",
      };
      expect(dep.name).toBe("Test");
      expect(dep.command).toBe("test");
      expect(dep.checkArgs).toEqual(["--version"]);
      expect(dep.installHint).toBe("Install test");
    });

    it("should accept Dependency without optional installHint", () => {
      const dep: Dependency = {
        name: "Test",
        command: "test",
        checkArgs: ["--version"],
      };
      expect(dep.installHint).toBeUndefined();
    });
  });

  describe("checkDependency", () => {
    it("should export checkDependency function", () => {
      expect(typeof checkDependency).toBe("function");
    });

    it("should return true for bun (we know it exists)", async () => {
      const bunDep: Dependency = {
        name: "Bun",
        command: "bun",
        checkArgs: ["--version"],
      };
      
      const result = await checkDependency(bunDep);
      expect(result).toBe(true);
    });

    it("should return false for non-existent command", async () => {
      const fakeDep: Dependency = {
        name: "Fake",
        command: "this-command-does-not-exist-12345",
        checkArgs: ["--version"],
      };
      
      const result = await checkDependency(fakeDep);
      expect(result).toBe(false);
    });

    it("should handle dependency with multiple check args", async () => {
      const multiArgDep: Dependency = {
        name: "Bun",
        command: "bun",
        checkArgs: ["--version", "--no-install"],
      };
      
      const result = await checkDependency(multiArgDep);
      // Should still work even with extra arg
      expect(typeof result).toBe("boolean");
    });

    it("should handle dependency with no check args", async () => {
      const noArgDep: Dependency = {
        name: "Bun",
        command: "bun",
        checkArgs: [],
      };
      
      const result = await checkDependency(noArgDep);
      // Just running "bun" should succeed
      expect(result).toBe(true);
    });

    it("should handle command that exits with error", async () => {
      const badDep: Dependency = {
        name: "False",
        command: "false", // Unix command that always returns exit code 1
        checkArgs: [],
      };
      
      const result = await checkDependency(badDep);
      expect(result).toBe(false);
    });
  });

  describe("checkAllDependencies", () => {
    it("should export checkAllDependencies function", () => {
      expect(typeof checkAllDependencies).toBe("function");
    });

    it("should return available and missing arrays", async () => {
      const result = await checkAllDependencies();

      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
      expect(result.available).toBeDefined();
      expect(result.missing).toBeDefined();
      expect(Array.isArray(result.available)).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it("should return result with all dependencies categorized", async () => {
      const result = await checkAllDependencies();

      // Each dep should be in either available or missing
      const allResultDeps = [...result.available, ...result.missing];
      
      // Should match the number of dependencies defined
      expect(allResultDeps.length).toBe(DEPENDENCIES.length);
    });

    it("should have Bun in available (assuming it exists)", async () => {
      const result = await checkAllDependencies();
      
      const availableNames = result.available.map((d) => d.name);
      // Since we're running with bun, it should be available
      expect(availableNames).toContain("Bun");
    });

    it("should return immutable arrays", async () => {
      const result = await checkAllDependencies();
      
      // Verify we get fresh arrays each time
      const result2 = await checkAllDependencies();
      expect(result.available).not.toBe(result2.available);
      expect(result.missing).not.toBe(result2.missing);
    });
  });
});
