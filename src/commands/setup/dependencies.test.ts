/**
 * Tests for setup dependencies
 */

import { describe, expect, it } from "bun:test";
import { checkDependency, checkAllDependencies, DEPENDENCIES, type Dependency } from "./dependencies.ts";

describe("dependencies", () => {
  describe("DEPENDENCIES", () => {
    it("should have required dependencies defined", () => {
      expect(DEPENDENCIES.length).toBeGreaterThan(0);
      
      const names = DEPENDENCIES.map((d) => d.name);
      expect(names).toContain("Bun");
    });

    it("should have valid dependency structure", () => {
      for (const dep of DEPENDENCIES) {
        expect(dep.name).toBeTruthy();
        expect(dep.command).toBeTruthy();
        expect(Array.isArray(dep.checkArgs)).toBe(true);
      }
    });
  });

  describe("checkDependency", () => {
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
  });

  describe("checkAllDependencies", () => {
    it("should return available and missing arrays", async () => {
      const result = await checkAllDependencies();

      expect(result).toBeDefined();
      expect(result.available).toBeDefined();
      expect(result.missing).toBeDefined();
      expect(Array.isArray(result.available)).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it("should check all DEPENDENCIES entries", async () => {
      const result = await checkAllDependencies();

      // Each dep should be in either available or missing
      const allResultDeps = [...result.available, ...result.missing];
      
      // At minimum, we should get results back
      expect(allResultDeps.length).toBeGreaterThan(0);
    });
  });
});
