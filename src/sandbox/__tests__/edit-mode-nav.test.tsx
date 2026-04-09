/**
 * Edit mode exit and keyboard navigation functional tests
 */

import { describe, it, expect } from "bun:test";
import { renderWithProviders } from "./test-helper.tsx";
import { TicketInput } from "../../components/ticket-input/index.ts";

const TICKET_INPUT_DIMS = { width: 60, height: 24 };

describe("Edit mode exit: TicketInput modal", () => {
  it("Enter works to re-enter edit mode after Enter exits it", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("X");
    await ctx.renderOnce();
    let frame = ctx.captureCharFrame();
    expect(frame).toContain("x");
    expect(frame).toContain("_");

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    frame = ctx.captureCharFrame();
    expect(frame).toContain("x");
    expect(frame).not.toContain("x_");

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("Z");
    await ctx.renderOnce();

    frame = ctx.captureCharFrame();
    expect(frame).toContain("xz");
    expect(frame).toContain("_");
  });

  it("arrow keys work to navigate after exiting edit mode", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("T");
    await ctx.renderOnce();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();

    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("Z");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("tz");
  });

  it("typing does not work outside edit mode (confirms edit mode exit)", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("A");
    await ctx.renderOnce();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("B");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("a");
    expect(frame).not.toContain("ab");
  });
});

describe("Edit mode exit: Grid cell navigation", () => {
  it("full navigation cycle works in TicketInput Grid", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressKey("T");
    await ctx.renderOnce();
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("right");
    await ctx.renderOnce();

    let frame = ctx.captureCharFrame();
    expect(frame).toContain("[*] Claude Code");

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressKey("Z");
    await ctx.renderOnce();

    frame = ctx.captureCharFrame();
    expect(frame).toContain("tz");
    expect(frame).toContain("_");
  });
});

describe("Typing: TicketInput modal", () => {
  it("typing a valid key shows feedback without errors", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    for (const ch of ["P", "R", "O", "J", "-", "1"]) {
      ctx.mockInput.pressKey(ch);
      await ctx.renderOnce();
    }

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("Key: PROJ-1");
    expect(frame).not.toContain("Invalid");
  });

  it("backspace removes last character", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    for (const ch of ["A", "B", "C"]) {
      ctx.mockInput.pressKey(ch);
      await ctx.renderOnce();
    }
    ctx.mockInput.pressBackspace();
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("ab");
    expect(frame).not.toContain("abc");
  });
});