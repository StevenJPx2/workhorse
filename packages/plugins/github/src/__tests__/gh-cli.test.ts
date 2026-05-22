/**
 * Tests for gh-cli utilities.
 */
import { describe, expect, it } from "vitest";

import { isRateLimitError } from "../gh-cli.ts";

describe("isRateLimitError", () => {
  it("returns true for rate limit messages", () => {
    expect(isRateLimitError(new Error("rate limit exceeded"))).toBe(true);
    expect(isRateLimitError(new Error("RATE LIMIT exceeded"))).toBe(true);
  });

  it("returns true for API rate limit exceeded", () => {
    expect(isRateLimitError(new Error("API rate limit exceeded"))).toBe(true);
    expect(
      isRateLimitError(new Error("api rate limit exceeded for user")),
    ).toBe(true);
  });

  it("returns true for secondary rate limit", () => {
    expect(
      isRateLimitError(new Error("You have exceeded a secondary rate limit")),
    ).toBe(true);
    expect(isRateLimitError(new Error("secondary rate limit"))).toBe(true);
  });

  it("returns false for non-Error values", () => {
    expect(isRateLimitError("string error")).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError({ message: "rate limit" })).toBe(false);
  });

  it("returns false for other errors", () => {
    expect(isRateLimitError(new Error("gh api /repos/... failed: 404"))).toBe(
      false,
    );
    expect(isRateLimitError(new Error("Not authenticated"))).toBe(false);
    expect(isRateLimitError(new Error("Network error"))).toBe(false);
    expect(isRateLimitError(new Error("Permission denied"))).toBe(false);
  });
});
