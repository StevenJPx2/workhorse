/**
 * Functional tests — verify actual behavior, not just rendering
 *
 * These tests simulate real user flows (paste, type, submit, navigate)
 * with mocked external dependencies, and assert on component STATE
 * rather than just frame content.
 *
 * This is the layer that catches "paste doesn't work" style bugs.
 */

import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { renderWithProviders } from "./test-helper.tsx";
import { TextInput } from "../components/text-input/text-input.tsx";
import { Grid, GridCell } from "../components/grid/index.ts";
import { TicketInput } from "../components/ticket-input/index.ts";
import * as clipboard from "../lib/clipboard.ts";

// ─── Paste flow ─────────────────────────────────────────────────

describe("Paste: TextInput", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(clipboard, "readClipboardSync").mockReturnValue("CLIPBOARD_TEXT");
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("pastes into standalone focused input on Ctrl+V", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="t1"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(spy).toHaveBeenCalled();
    expect(value).toBe("CLIPBOARD_TEXT");
  });

  it("pastes into standalone focused input on Cmd+V (meta)", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="t2"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressKey("v", { meta: true });
    await ctx.renderOnce();

    expect(spy).toHaveBeenCalled();
    expect(value).toBe("CLIPBOARD_TEXT");
  });

  it("pastes into standalone focused input on raw \\x16", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="t3"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressKey("\x16");
    await ctx.renderOnce();

    expect(spy).toHaveBeenCalled();
    expect(value).toBe("CLIPBOARD_TEXT");
  });

  it("pastes into Grid cell when focused (no edit mode needed)", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <Grid rows={1} cols={1}>
          <GridCell id="c1" row={0} col={0}>
            <TextInput
              inputId="t4"
              value={value}
              onChange={(v) => { value = v; }}
            />
          </GridCell>
        </Grid>
      ),
      { width: 40, height: 5 },
    );

    // Cell auto-focused, paste without entering edit mode
    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(spy).toHaveBeenCalled();
    expect(value).toBe("CLIPBOARD_TEXT");
  });

  it("pastes into Grid cell in edit mode", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <Grid rows={1} cols={1}>
          <GridCell id="c2" row={0} col={0}>
            <TextInput
              inputId="t5"
              value={value}
              onChange={(v) => { value = v; }}
            />
          </GridCell>
        </Grid>
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressEnter(); // enter edit mode
    await ctx.renderOnce();

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(spy).toHaveBeenCalled();
    expect(value).toBe("CLIPBOARD_TEXT");
  });

  it("appends paste to existing value", async () => {
    let value = "existing-";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="t6"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(value).toBe("existing-CLIPBOARD_TEXT");
  });

  it("does nothing when clipboard is empty", async () => {
    spy.mockReturnValue("");
    let value = "unchanged";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="t7"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(value).toBe("unchanged");
  });

  it("does nothing when input is disabled", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="t8"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
          disabled
        />
      ),
      { width: 40, height: 5 },
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(spy).not.toHaveBeenCalled();
    expect(value).toBe("");
  });
});

// ─── Paste in TicketInput modal ─────────────────────────────────

describe("Paste: TicketInput modal", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(clipboard, "readClipboardSync").mockReturnValue("AM-789");
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("pastes ticket key when cell is focused", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      { width: 60, height: 24 },
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("AM-789");
    expect(frame).toContain("Key: AM-789");
  });

  it("pastes Jira URL and shows parsed key", async () => {
    spy.mockReturnValue("https://myco.atlassian.net/browse/PROJ-42");

    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      { width: 60, height: 24 },
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("atlassian.net");
    expect(frame).toContain("Key: PROJ-42");
  });

  it("pastes in edit mode after Enter", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      { width: 60, height: 24 },
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("AM-789");
  });
});

// ─── Bracketed paste (real terminal paste) ──────────────────────

describe("Bracketed paste: TextInput", () => {
  it("pastes text via terminal paste into focused input", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="bp1"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    await ctx.mockInput.pasteBracketedText("PASTED_VALUE");
    await ctx.renderOnce();

    expect(value).toBe("PASTED_VALUE");
  });

  it("pastes into Grid cell when focused", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <Grid rows={1} cols={1}>
          <GridCell id="bp2" row={0} col={0}>
            <TextInput
              inputId="bp2-input"
              value={value}
              onChange={(v) => { value = v; }}
            />
          </GridCell>
        </Grid>
      ),
      { width: 40, height: 5 },
    );

    await ctx.mockInput.pasteBracketedText("GRID_PASTE");
    await ctx.renderOnce();

    expect(value).toBe("GRID_PASTE");
  });

  it("appends to existing value", async () => {
    let value = "before-";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="bp3"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
        />
      ),
      { width: 40, height: 5 },
    );

    await ctx.mockInput.pasteBracketedText("after");
    await ctx.renderOnce();

    expect(value).toBe("before-after");
  });

  it("does nothing on disabled input", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="bp4"
          value={value}
          onChange={(v) => { value = v; }}
          focused={true}
          disabled
        />
      ),
      { width: 40, height: 5 },
    );

    await ctx.mockInput.pasteBracketedText("SHOULD_NOT_PASTE");
    await ctx.renderOnce();

    expect(value).toBe("");
  });
});

describe("Bracketed paste: TicketInput modal", () => {
  it("pastes ticket key into modal", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      { width: 60, height: 24 },
    );

    await ctx.mockInput.pasteBracketedText("AM-789");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("AM-789");
    expect(frame).toContain("Key: AM-789");
  });

  it("pastes Jira URL and shows parsed key", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      { width: 60, height: 24 },
    );

    await ctx.mockInput.pasteBracketedText("https://myco.atlassian.net/browse/PROJ-42");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("atlassian.net");
    expect(frame).toContain("Key: PROJ-42");
  });

  it("pastes after entering edit mode", async () => {
    const ctx = await renderWithProviders(
      () => (
        <TicketInput
          isOpen={true}
          onClose={() => {}}
          onSubmit={() => {}}
          fetchIssue={async () => { throw new Error("n/a"); }}
        />
      ),
      { width: 60, height: 24 },
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    await ctx.mockInput.pasteBracketedText("AM-999");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("AM-999");
  });
});

// ─── Clipboard system command ───────────────────────────────────

describe("Clipboard: readClipboardSync", () => {
  it("reads actual system clipboard without crashing", () => {
    // This tests that pbpaste/xclip actually runs and returns a string
    // (even if clipboard is empty). Catches stdio/pipe issues.
    const result = clipboard.readClipboardSync();
    expect(typeof result).toBe("string");
  });

  it("returns consistent results on repeated calls", () => {
    const a = clipboard.readClipboardSync();
    const b = clipboard.readClipboardSync();
    expect(a).toBe(b);
  });
});

// ─── Edit mode exit keyboard navigation ─────────────────────────

describe("Edit mode exit: TicketInput modal", () => {
  // NOTE: pressEscape() doesn't work in tests due to terminal escape sequence parsing.
  // We test Escape-like behavior through Enter exits instead.

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
      { width: 60, height: 24 },
    );

    // Enter edit mode
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Type some text
    ctx.mockInput.pressKey("X");
    await ctx.renderOnce();
    let frame = ctx.captureCharFrame();
    expect(frame).toContain("x"); // Text present
    expect(frame).toContain("_"); // Cursor indicates edit mode

    // Exit edit mode with Enter (which exits edit mode in Grid)
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Cursor should be gone (no longer in edit mode)
    frame = ctx.captureCharFrame();
    expect(frame).toContain("x"); // Text still there
    expect(frame).not.toContain("x_"); // But no cursor

    // Now press Enter to re-enter edit mode
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Type more text - should work since TicketInput uses signals internally
    ctx.mockInput.pressKey("Z");
    await ctx.renderOnce();

    frame = ctx.captureCharFrame();
    expect(frame).toContain("xz"); // Both characters present
    expect(frame).toContain("_"); // Cursor shown
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
      { width: 60, height: 24 },
    );

    // Enter edit mode on the input
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Type some text
    ctx.mockInput.pressKey("T");
    await ctx.renderOnce();

    // Exit edit mode with Enter
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Navigate down with arrow key (should move to feedback row, then agent select)
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();

    // Navigate back up
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();

    // Should be back at the input, Enter should enter edit mode
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Type another character to verify we're in edit mode
    ctx.mockInput.pressKey("Z");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("tz"); // Both characters
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
      { width: 60, height: 24 },
    );

    // Enter edit mode
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Type some text
    ctx.mockInput.pressKey("A");
    await ctx.renderOnce();

    // Exit edit mode with Enter
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Try to type without re-entering edit mode
    ctx.mockInput.pressKey("B");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("a"); // First character present
    expect(frame).not.toContain("ab"); // Second character NOT present
  });
});

describe("Edit mode exit: Grid cell navigation", () => {
  // NOTE: Tests using `let value = ""` don't work properly with Solid.js
  // because the closure doesn't create reactive bindings.
  // TicketInput tests above use the component's internal signals.
  // For standalone Grid tests, use TicketInput which handles signals correctly.

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
      { width: 60, height: 24 },
    );

    // Enter edit mode, type, exit
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressKey("T");
    await ctx.renderOnce();
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    // Navigate down twice to agent select
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("down");
    await ctx.renderOnce();

    // Enter edit mode on Select, change selection
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("right");
    await ctx.renderOnce();

    let frame = ctx.captureCharFrame();
    expect(frame).toContain("[*] Claude Code"); // Selection changed

    // Exit edit mode, navigate back to input
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();
    ctx.mockInput.pressArrow("up");
    await ctx.renderOnce();

    // Re-enter edit mode and type
    ctx.mockInput.pressEnter();
    await ctx.renderOnce();
    ctx.mockInput.pressKey("Z");
    await ctx.renderOnce();

    frame = ctx.captureCharFrame();
    expect(frame).toContain("tz"); // Original + new character
    expect(frame).toContain("_"); // In edit mode
  });
});

// ─── Typing flow ────────────────────────────────────────────────

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
      { width: 60, height: 24 },
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
      { width: 60, height: 24 },
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
