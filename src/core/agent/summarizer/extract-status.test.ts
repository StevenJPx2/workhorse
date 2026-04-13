/**
 * Tests for extractStatusFromMessage function
 */

import { describe, it, expect } from "bun:test";
import { extractStatusFromMessage } from "./extract-status.ts";

describe("extractStatusFromMessage", () => {
  it("should return empty array for empty text", () => {
    expect(extractStatusFromMessage("")).toEqual([]);
    expect(extractStatusFromMessage("   ")).toEqual([]);
    expect(extractStatusFromMessage("\n\n")).toEqual([]);
  });

  it("should extract reason from bold Issue: pattern in error context", () => {
    const text = "blocked **Issue:** Cannot proceed\n\nMore content";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Cannot proceed");
    expect(result[0].type).toBe("error");
  });

  it("should extract reason from bold Reason: pattern in error context", () => {
    const text = "error **Reason:** The reason is clear\n\nOther content";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("The reason is clear");
  });

  it("should extract reason from bold Problem: pattern in error context", () => {
    const text = "failed **Problem:** There is a problem here";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("There is a problem here");
  });

  it("should extract reason from bold Error: pattern", () => {
    const text = "error **Error:** Something went wrong";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Something went wrong");
  });

  it("should extract reason from plain Issue: pattern in error context", () => {
    const text = "error Issue: Plain issue text\n\nMore content";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Plain issue text");
  });

  it("should detect blocked/error type", () => {
    const text = "This operation is blocked and cannot continue";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("error");
  });

  it("should detect failed/error type", () => {
    const text = "The operation has failed completely";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("error");
  });

  it("should detect error keyword type", () => {
    const text = "An error occurred during processing";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("error");
  });

  it("should detect complete/result type", () => {
    const text = "The task is complete and done";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("result");
  });

  it("should detect finished/result type", () => {
    const text = "Work finished successfully";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("result");
  });

  it("should detect done/result type", () => {
    const text = "Everything is done";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("result");
  });

  it("should detect thinking type with question", () => {
    const text = "Would you like to proceed?";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("thinking");
  });

  it("should detect waiting/thinking type", () => {
    const text = "Waiting for your response";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("thinking");
  });

  it("should default to action type", () => {
    const text = "Regular action message";
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("action");
  });

  it("should clean markdown bold from extracted text", () => {
    const text = "error **Issue:** `code` and **bold** text\n\nMore";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).not.toContain("**");
    expect(result[0].description).not.toContain("`");
  });

  it("should fall back to first paragraph when no reason pattern matches", () => {
    const text = "An error occurred.\n\nSecond paragraph.";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).toBe("An error occurred.");
  });

  it("should limit to first 3 sentences in fallback", () => {
    const text =
      "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).toBe("First sentence. Second sentence. Third sentence.");
  });

  it("should include timestamp in result", () => {
    const text = "Some message";
    const result = extractStatusFromMessage(text);
    expect(result[0].timestamp).toBeTruthy();
    expect(() => new Date(result[0].timestamp)).not.toThrow();
  });

  it("should handle complex markdown with error", () => {
    const text = `blocked\n\n**Issue:** The **main** problem is here.\n\nMore content.`;
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("error");
    expect(result[0].description).not.toContain("**");
  });

  it("should prefer reason extraction over first paragraph for errors", () => {
    const text = "error first paragraph.\n\n**Issue:** This is the actual issue.\n\nMore.";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).toBe("This is the actual issue.");
    expect(result[0].type).toBe("error");
  });

  it("should handle text with no special patterns", () => {
    const text = "Just a regular message with no special patterns or markers.";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(text);
    expect(result[0].type).toBe("action");
  });

  it("should clean list markers from extracted text", () => {
    const text = "error Issue: - Item with dash";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).not.toMatch(/^- /);
  });

  it("should handle very long error text", () => {
    const text = "Error occurred while processing. " + "a".repeat(500);
    const result = extractStatusFromMessage(text);
    expect(result[0].type).toBe("error");
  });

  it("should preserve important error words in description", () => {
    const text = "The system failed to connect to the database server";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).toContain("failed");
  });

  it("should handle Reason: without bold in error context", () => {
    const text = "error Reason: Something went wrong\n\nMore";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).toBe("Something went wrong");
  });

  it("should handle Problem: without bold in error context", () => {
    const text = "failed Problem: We have an issue\n\nMore";
    const result = extractStatusFromMessage(text);
    expect(result[0].description).toBe("We have an issue");
  });

  it("should return single step", () => {
    const text = "Some status message";
    const result = extractStatusFromMessage(text);
    expect(result).toHaveLength(1);
  });
});
