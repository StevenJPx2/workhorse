/**
 * Paste flow functional tests — verify clipboard paste behavior
 */

import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { renderWithProviders } from "./test-helper.tsx";
import { TextInput } from "../../components/text-input/text-input.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";
import { TicketInput } from "../../components/ticket-input/index.ts";
import * as clipboard from "#core/clipboard.ts";

const TEXT_INPUT_DIMS = { width: 40, height: 5 };
const TICKET_INPUT_DIMS = { width: 60, height: 24 };

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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
              onChange={(v) => {
                value = v;
              }}
            />
          </GridCell>
        </Grid>
      ),
      TEXT_INPUT_DIMS,
    );

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
              onChange={(v) => {
                value = v;
              }}
            />
          </GridCell>
        </Grid>
      ),
      TEXT_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
          disabled
        />
      ),
      TEXT_INPUT_DIMS,
    );

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    expect(spy).not.toHaveBeenCalled();
    expect(value).toBe("");
  });
});

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
          fetchIssue={async () => {
            throw new Error("n/a");
          }}
        />
      ),
      TICKET_INPUT_DIMS,
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
          fetchIssue={async () => {
            throw new Error("n/a");
          }}
        />
      ),
      TICKET_INPUT_DIMS,
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
          fetchIssue={async () => {
            throw new Error("n/a");
          }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    ctx.mockInput.pressKey("v", { ctrl: true });
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("AM-789");
  });
});
