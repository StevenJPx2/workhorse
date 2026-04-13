/**
 * Tests for trace.ts - orchestrator debug trace helper
 */

import { describe, it, expect } from "bun:test";
import { orchestratorTrace } from "./trace.ts";

describe("orchestratorTrace", () => {
  it("should not throw when called with basic args", () => {
    expect(() => orchestratorTrace("TICKET-123", "START")).not.toThrow();
  });

  it("should not throw when called with data", () => {
    expect(() =>
      orchestratorTrace("TICKET-123", "UPDATE", { status: "running", pid: 1234 }),
    ).not.toThrow();
  });

  it("should not throw with null data", () => {
    expect(() => orchestratorTrace("TICKET-123", "STOP", null)).not.toThrow();
  });

  it("should not throw with string data", () => {
    expect(() => orchestratorTrace("TICKET-123", "MESSAGE", "some message")).not.toThrow();
  });

  it("should not throw with number data", () => {
    expect(() => orchestratorTrace("TICKET-123", "COUNT", 42)).not.toThrow();
  });

  it("should not throw with array data", () => {
    expect(() => orchestratorTrace("TICKET-123", "LIST", [1, 2, 3])).not.toThrow();
  });

  it("should handle empty ticket id", () => {
    expect(() => orchestratorTrace("", "STEP")).not.toThrow();
  });

  it("should handle empty step", () => {
    expect(() => orchestratorTrace("TICKET-123", "")).not.toThrow();
  });

  it("should handle undefined data (no third arg)", () => {
    expect(() => orchestratorTrace("TICKET-123", "NO_DATA")).not.toThrow();
  });
});
