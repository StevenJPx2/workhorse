/**
 * Bracketed paste and clipboard functional tests
 */

import { describe, it, expect } from "bun:test";
import { renderWithProviders } from "./test-helper.tsx";
import { TextInput } from "../../components/text-input/text-input.tsx";
import { Grid, GridCell } from "../../components/grid/index.ts";
import { TicketInput } from "../../components/ticket-input/index.ts";
import * as clipboard from "#core/clipboard.ts";

const TEXT_INPUT_DIMS = { width: 40, height: 5 };
const TICKET_INPUT_DIMS = { width: 60, height: 24 };

describe("Bracketed paste: TextInput", () => {
  it("pastes text via terminal paste into focused input", async () => {
    let value = "";
    const ctx = await renderWithProviders(
      () => (
        <TextInput
          inputId="bp1"
          value={value}
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
              onChange={(v) => {
                value = v;
              }}
            />
          </GridCell>
        </Grid>
      ),
      TEXT_INPUT_DIMS,
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
        />
      ),
      TEXT_INPUT_DIMS,
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
          onChange={(v) => {
            value = v;
          }}
          focused={true}
          disabled
        />
      ),
      TEXT_INPUT_DIMS,
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
          fetchIssue={async () => {
            throw new Error("n/a");
          }}
        />
      ),
      TICKET_INPUT_DIMS,
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
          fetchIssue={async () => {
            throw new Error("n/a");
          }}
        />
      ),
      TICKET_INPUT_DIMS,
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
          fetchIssue={async () => {
            throw new Error("n/a");
          }}
        />
      ),
      TICKET_INPUT_DIMS,
    );

    ctx.mockInput.pressEnter();
    await ctx.renderOnce();

    await ctx.mockInput.pasteBracketedText("AM-999");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("AM-999");
  });
});

describe("Clipboard: readClipboardSync", () => {
  it("reads actual system clipboard without crashing", () => {
    const result = clipboard.readClipboardSync();
    expect(typeof result).toBe("string");
  });

  it("returns consistent results on repeated calls", () => {
    const a = clipboard.readClipboardSync();
    const b = clipboard.readClipboardSync();
    expect(a).toBe(b);
  });
});
