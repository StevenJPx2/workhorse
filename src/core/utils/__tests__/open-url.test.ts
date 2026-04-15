/**
 * Tests for open-url utility
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { openUrl } from "../open-url.ts";

describe("openUrl", () => {
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: string[][] = [];

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    spawnCalls = [];

    // Mock Bun.spawn to capture calls
    Bun.spawn = ((args: string[]) => {
      spawnCalls.push(args);
      return {
        exited: Promise.resolve(0),
      };
    }) as unknown as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  it("should spawn open command on macOS with URL", async () => {
    // The test environment is darwin (macOS)
    await openUrl("https://example.com");

    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0]).toEqual(["open", "https://example.com"]);
  });

  it("should handle various URL formats", async () => {
    await openUrl("https://jira.atlassian.com/browse/TEST-123");

    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0][1]).toBe("https://jira.atlassian.com/browse/TEST-123");
  });
});
