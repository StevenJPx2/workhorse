/**
 * Tests for Jira sync functions
 */

import { describe, it, expect } from "bun:test";
import {
  STATUS_TRANSITION_MAP,
  getTransitionId,
  formatPRComment,
  formatSyncSuccessMessage,
  formatSyncFailureMessage,
} from "./sync.ts";

describe("STATUS_TRANSITION_MAP", () => {
  it("should map pending status", () => {
    expect(STATUS_TRANSITION_MAP["pending"]).toBe("11");
  });

  it("should map queued status", () => {
    expect(STATUS_TRANSITION_MAP["queued"]).toBe("21");
  });

  it("should map planning status", () => {
    expect(STATUS_TRANSITION_MAP["planning"]).toBe("31");
  });

  it("should map implementing status", () => {
    expect(STATUS_TRANSITION_MAP["implementing"]).toBe("41");
  });

  it("should map blocked status", () => {
    expect(STATUS_TRANSITION_MAP["blocked"]).toBe("61");
  });

  it("should map pr_created status", () => {
    expect(STATUS_TRANSITION_MAP["pr_created"]).toBe("71");
  });

  it("should map in_review status", () => {
    expect(STATUS_TRANSITION_MAP["in_review"]).toBe("81");
  });

  it("should map done status", () => {
    expect(STATUS_TRANSITION_MAP["done"]).toBe("91");
  });
});

describe("getTransitionId", () => {
  it("should return transition ID for known status", () => {
    expect(getTransitionId("pending")).toBe("11");
    expect(getTransitionId("done")).toBe("91");
  });

  it("should return undefined for unknown status", () => {
    expect(getTransitionId("unknown")).toBeUndefined();
    expect(getTransitionId("")).toBeUndefined();
  });

  it("should be case sensitive", () => {
    expect(getTransitionId("Pending")).toBeUndefined();
    expect(getTransitionId("DONE")).toBeUndefined();
  });
});

describe("formatPRComment", () => {
  it("should format PR URL as comment", () => {
    const prUrl = "https://github.com/org/repo/pull/123";
    expect(formatPRComment(prUrl)).toBe("Pull Request: https://github.com/org/repo/pull/123");
  });

  it("should handle empty URL", () => {
    expect(formatPRComment("")).toBe("Pull Request: ");
  });
});

describe("formatSyncSuccessMessage", () => {
  it("should format success message for comment action", () => {
    const timestamp = "2024-01-15T10:30:00.000Z";
    expect(formatSyncSuccessMessage("comment", timestamp)).toBe(
      "[jira-sync:comment] Success at 2024-01-15T10:30:00.000Z",
    );
  });

  it("should format success message for transition action", () => {
    const timestamp = "2024-01-15T10:30:00.000Z";
    expect(formatSyncSuccessMessage("transition", timestamp)).toBe(
      "[jira-sync:transition] Success at 2024-01-15T10:30:00.000Z",
    );
  });

  it("should format success message for link_pr action", () => {
    const timestamp = "2024-01-15T10:30:00.000Z";
    expect(formatSyncSuccessMessage("link_pr", timestamp)).toBe(
      "[jira-sync:link_pr] Success at 2024-01-15T10:30:00.000Z",
    );
  });
});

describe("formatSyncFailureMessage", () => {
  it("should format failure message for comment action", () => {
    expect(formatSyncFailureMessage("comment", "Network error")).toBe(
      "[jira-sync:comment] Failed: Network error",
    );
  });

  it("should format failure message with empty error", () => {
    expect(formatSyncFailureMessage("transition", "")).toBe("[jira-sync:transition] Failed: ");
  });

  it("should format failure message with complex error", () => {
    const error = "HTTP 403: Forbidden - Insufficient permissions";
    expect(formatSyncFailureMessage("link_pr", error)).toBe(
      "[jira-sync:link_pr] Failed: HTTP 403: Forbidden - Insufficient permissions",
    );
  });
});
