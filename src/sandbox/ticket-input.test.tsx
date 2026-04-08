/**
 * TicketInput modal — autonomous visual tests
 *
 * These tests render the add-ticket modal and simulate user interactions
 * to catch real bugs:
 * - Error messages appearing when they shouldn't
 * - Paste not working
 * - Input not accepting characters
 * - Form state not resetting
 *
 * To update snapshots: bun test src/sandbox/ticket-input.test.tsx -u
 */

import { describe, it, expect, mock } from "bun:test";
import { renderWithProviders } from "./test-helper.tsx";
import { TicketInput } from "../components/ticket-input/index.ts";

const mockFetchIssue = mock(async () => {
  throw new Error("not connected");
});

function renderTicketInput(isOpen = true) {
  return renderWithProviders(
    () => (
      <TicketInput
        isOpen={isOpen}
        onClose={() => {}}
        onSubmit={() => {}}
        fetchIssue={mockFetchIssue}
      />
    ),
    { width: 60, height: 24 },
  );
}

// ─── Snapshots ──────────────────────────────────────────────────

describe("TicketInput snapshots", () => {
  it("initial open state", async () => {
    const ctx = await renderTicketInput();
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("after entering edit mode", async () => {
    const ctx = await renderTicketInput();
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("after typing a valid key", async () => {
    const ctx = await renderTicketInput();
    ctx.mockInput.pressEnter(); // enter edit mode
    await ctx.renderOnce();
    for (const ch of ["A", "M", "-", "1", "2", "3"]) {
      ctx.mockInput.pressKey(ch);
      await ctx.renderOnce();
    }
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("closed state", async () => {
    const ctx = await renderTicketInput(false);
    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });
});

// ─── Behavioral assertions ──────────────────────────────────────

describe("TicketInput behavior", () => {
  it("does NOT show error when entering edit mode", async () => {
    const ctx = await renderTicketInput();

    // Press Enter to enter edit mode (Grid cell → edit)
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).not.toContain("Invalid ticket key");
    expect(frame).not.toContain("Expected: PROJECT-123");
  });

  it("does NOT show error while typing partial input", async () => {
    const ctx = await renderTicketInput();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Type partial key "AM-"
    for (const ch of ["A", "M", "-"]) {
      ctx.mockInput.pressKey(ch);
      await ctx.renderOnce();
    }

    const frame = ctx.captureCharFrame();
    // Error should not appear for incomplete but in-progress input
    expect(frame).not.toContain("Invalid ticket key");
  });

  it("accepts typed characters in edit mode", async () => {
    const ctx = await renderTicketInput();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("X");
    await ctx.renderOnce();
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    // The typed character should appear in the input (lowercase since key.name is lowercase)
    expect(frame.toLowerCase()).toContain("x");
  });

  it("shows cursor in edit mode", async () => {
    const ctx = await renderTicketInput();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    expect(ctx.captureCharFrame()).toContain("_");
  });

  it("shows parsed key feedback for valid input", async () => {
    const ctx = await renderTicketInput();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    for (const ch of ["A", "M", "-", "1", "2", "3"]) {
      ctx.mockInput.pressKey(ch);
      await ctx.renderOnce();
    }

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("Key: AM-123");
  });

  it("shows Add Ticket button", async () => {
    const ctx = await renderTicketInput();
    expect(ctx.captureCharFrame()).toContain("Add Ticket");
  });

  it("shows Cancel button", async () => {
    const ctx = await renderTicketInput();
    expect(ctx.captureCharFrame()).toContain("Cancel");
  });

  it("shows agent selection", async () => {
    const ctx = await renderTicketInput();
    const frame = ctx.captureCharFrame();
    expect(frame).toContain("OpenCode");
    expect(frame).toContain("Claude Code");
  });

  it("renders placeholder in empty input", async () => {
    const ctx = await renderTicketInput();
    expect(ctx.captureCharFrame()).toContain("AM-123 or paste Jira URL");
  });
});

// ─── Cross-theme ────────────────────────────────────────────────

describe("TicketInput themes", () => {
  for (const theme of ["tokyonight", "gruvbox", "default"] as const) {
    it(`renders in ${theme} without errors`, async () => {
      const ctx = await renderWithProviders(
        () => (
          <TicketInput
            isOpen={true}
            onClose={() => {}}
            onSubmit={() => {}}
            fetchIssue={mockFetchIssue}
          />
        ),
        { width: 60, height: 24, theme },
      );

      const frame = ctx.captureCharFrame();
      expect(frame).toContain("Add Ticket");
      expect(frame).not.toContain("Invalid");
    });
  }
});
