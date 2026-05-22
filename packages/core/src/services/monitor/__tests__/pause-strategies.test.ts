import { describe, expect, it } from "vitest";

import {
  createRateLimitChecker,
  exponentialBackoff,
  extractRetryAfter,
  fixedPause,
  parseRetryAfter,
  withRetryAfterOrBackoff,
} from "../pause-strategies.ts";

describe("extractRetryAfter", () => {
  it("returns retryAfterMs from error property", () => {
    const error = new Error("Rate limit exceeded") as Error & {
      retryAfterMs?: number;
    };
    error.retryAfterMs = 45000;
    expect(extractRetryAfter(error)).toBe(45000);
  });

  it("caps retryAfterMs at MAX_PAUSE_MS (10 minutes)", () => {
    const error = new Error("Rate limit exceeded") as Error & {
      retryAfterMs?: number;
    };
    error.retryAfterMs = 900_000; // 15 minutes
    expect(extractRetryAfter(error)).toBe(600_000); // Capped at 10 minutes
  });

  it("returns undefined for errors without retryAfterMs", () => {
    expect(extractRetryAfter(new Error("Network error"))).toBeUndefined();
    expect(extractRetryAfter(new Error("Rate limit exceeded"))).toBeUndefined();
  });
});

describe("exponentialBackoff", () => {
  it("returns base delay for first error", () => {
    const result = exponentialBackoff(1);
    // Base is 5000ms, jitter is 0.7-1.3, so result should be 3500-6500
    expect(result).toBeGreaterThanOrEqual(3500);
    expect(result).toBeLessThanOrEqual(6500);
  });

  it("doubles delay for each subsequent error", () => {
    // errorCount 2: 2^1 * 5000 = 10000, with jitter: 7000-13000
    const result2 = exponentialBackoff(2);
    expect(result2).toBeGreaterThanOrEqual(7000);
    expect(result2).toBeLessThanOrEqual(13000);

    // errorCount 3: 2^2 * 5000 = 20000, with jitter: 14000-26000
    const result3 = exponentialBackoff(3);
    expect(result3).toBeGreaterThanOrEqual(14000);
    expect(result3).toBeLessThanOrEqual(26000);
  });

  it("respects custom base and max", () => {
    const result = exponentialBackoff(1, 1000, 5000);
    expect(result).toBeGreaterThanOrEqual(700);
    expect(result).toBeLessThanOrEqual(1300);
  });

  it("caps at maxMs", () => {
    const result = exponentialBackoff(20, 5000, 60000);
    // Should be capped at 60000 * jitter
    expect(result).toBeLessThanOrEqual(78000); // 60000 * 1.3
  });
});

describe("withRetryAfterOrBackoff", () => {
  it("uses retryAfterMs from error property when available", () => {
    const fn = withRetryAfterOrBackoff();
    const error = new Error("Rate limit") as Error & { retryAfterMs?: number };
    error.retryAfterMs = 90000;
    expect(fn({ error, errorCount: 1 })).toBe(90000);
  });

  it("uses default on first error without Retry-After", () => {
    const fn = withRetryAfterOrBackoff(30000);
    const error = new Error("Rate limit exceeded");
    expect(fn({ error, errorCount: 1 })).toBe(30000);
  });

  it("uses exponential backoff on subsequent errors without Retry-After", () => {
    const fn = withRetryAfterOrBackoff();
    const error = new Error("Rate limit exceeded");
    const result = fn({ error, errorCount: 3 });
    // errorCount 3: 2^2 * 5000 = 20000, with jitter: 14000-26000
    expect(result).toBeGreaterThanOrEqual(14000);
    expect(result).toBeLessThanOrEqual(26000);
  });

  it("always prefers Retry-After over backoff", () => {
    const fn = withRetryAfterOrBackoff();
    const error = new Error("Rate limit") as Error & { retryAfterMs?: number };
    error.retryAfterMs = 5000;
    // Even with high errorCount, should use Retry-After
    expect(fn({ error, errorCount: 10 })).toBe(5000);
  });
});

describe("fixedPause", () => {
  it("returns the fixed duration regardless of context", () => {
    const fn = fixedPause(30000);
    const error = new Error("Test error");
    expect(fn({ error, errorCount: 1 })).toBe(30000);
    expect(fn({ error, errorCount: 5 })).toBe(30000);
    expect(fn({ error, errorCount: 100 })).toBe(30000);
  });
});

describe("parseRetryAfter", () => {
  it("parses Retry-After header in seconds", () => {
    const headers = new Headers({ "Retry-After": "60" });
    expect(parseRetryAfter(headers)).toBe(60000);
  });

  it("parses x-ratelimit-reset header as Unix timestamp", () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 120;
    const headers = new Headers({
      "x-ratelimit-reset": String(futureTimestamp),
    });
    const result = parseRetryAfter(headers);
    expect(result).toBeGreaterThan(118000);
    expect(result).toBeLessThan(122000);
  });

  it("handles x-ratelimit-reset in milliseconds", () => {
    const futureMs = Date.now() + 60000;
    const headers = new Headers({ "x-ratelimit-reset": String(futureMs) });
    const result = parseRetryAfter(headers);
    expect(result).toBeGreaterThan(58000);
    expect(result).toBeLessThan(62000);
  });

  it("returns undefined when no headers present", () => {
    const headers = new Headers();
    expect(parseRetryAfter(headers)).toBeUndefined();
  });

  it("returns undefined for past timestamps", () => {
    const pastTimestamp = Math.floor(Date.now() / 1000) - 60;
    const headers = new Headers({ "x-ratelimit-reset": String(pastTimestamp) });
    expect(parseRetryAfter(headers)).toBeUndefined();
  });
});

describe("createRateLimitChecker", () => {
  it("returns true for matching patterns", () => {
    const check = createRateLimitChecker(["rate limit", "429"]);
    expect(check(new Error("Rate limit exceeded"))).toBe(true);
    expect(check(new Error("Error 429: Too many requests"))).toBe(true);
  });

  it("is case insensitive", () => {
    const check = createRateLimitChecker(["rate limit"]);
    expect(check(new Error("RATE LIMIT exceeded"))).toBe(true);
    expect(check(new Error("Rate Limit"))).toBe(true);
  });

  it("returns false for non-matching errors", () => {
    const check = createRateLimitChecker(["rate limit"]);
    expect(check(new Error("Network error"))).toBe(false);
    expect(check(new Error("Timeout"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    const check = createRateLimitChecker(["rate limit"]);
    expect(check("rate limit")).toBe(false);
    expect(check(null)).toBe(false);
    expect(check(undefined)).toBe(false);
    expect(check({ message: "rate limit" })).toBe(false);
  });
});
