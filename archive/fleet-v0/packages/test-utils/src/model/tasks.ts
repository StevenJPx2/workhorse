// Shared tool-choice tasks: the operations an agent actually performs.
//
// Each task carries an expectation per surface name, so the SAME task scores a
// granular surface and a consolidated one — which is what makes the comparison
// attributable to the surface rather than to different questions.
//
// Surface names used here: "granular" (one tool per operation) and
// "consolidated" (one tool per domain with an action picklist).

import type { Task } from "./score";

/** Browser + code-intelligence tasks covering read, mutate, and the write boundary. */
export const toolChoiceTasks: Task[] = [
  {
    id: "open-url",
    prompt: "Load https://example.com in the browser.",
    expect: {
      granular: { tool: "browser_open", args: { url: /example\.com/ } },
      consolidated: { tool: "browser", action: "open", args: { url: /example\.com/ } },
    },
  },
  {
    id: "snapshot",
    prompt: "The page is loaded. Get the accessibility tree so you can see the clickable elements and their refs.",
    expect: {
      granular: { tool: "browser_snapshot" },
      consolidated: { tool: "browser", action: "snapshot" },
    },
  },
  {
    id: "read-text",
    prompt: "The page is loaded. Read the page's text content so you can summarize the article.",
    expect: {
      granular: { tool: "browser_read" },
      consolidated: { tool: "browser", action: "read" },
    },
  },
  {
    id: "screenshot",
    prompt: "The page is loaded. Capture a PNG screenshot of the whole scrollable page to /tmp/shot.png.",
    expect: {
      granular: { tool: "browser_screenshot", args: { fullPage: true } },
      consolidated: { tool: "browser", action: "screenshot", args: { fullPage: true } },
    },
  },
  {
    id: "click-ref",
    prompt: 'A snapshot showed: button "Sign in" [ref=e7]. Click the sign-in button.',
    expect: {
      granular: { tool: "browser_act", args: { action: "click", selector: /e7/ } },
      consolidated: { tool: "browser_interact", action: "click", args: { selector: /e7/ } },
    },
  },
  {
    id: "fill-field",
    prompt: 'A snapshot showed: textbox "Email" [ref=e3]. Type alice@example.com into the email field.',
    expect: {
      granular: {
        tool: "browser_act",
        args: { action: (v) => v === "fill" || v === "type", value: /alice@example\.com/ },
      },
      consolidated: {
        tool: "browser_interact",
        args: { action: (v) => v === "fill" || v === "type", value: /alice@example\.com/ },
      },
    },
  },
  {
    // The signature bug that motivated splitting press out: it takes a KEY.
    id: "press-key",
    prompt: "You just filled the search field. Submit the form by pressing the Enter key.",
    expect: {
      granular: { tool: "browser_key", args: { key: /enter/i } },
      consolidated: { tool: "browser_interact", action: "press", args: { key: /enter/i } },
    },
  },
  {
    // The other signature bug: scroll takes a DIRECTION.
    id: "scroll-down",
    prompt: "Scroll down the page by 600 pixels to see more of the list.",
    expect: {
      granular: { tool: "browser_scroll", args: { direction: "down" } },
      consolidated: { tool: "browser_interact", action: "scroll", args: { direction: "down" } },
    },
  },
  {
    id: "outline-dir",
    prompt: "You are new to this repo. Get a structural overview of the src/api directory.",
    expect: {
      granular: { tool: "aft_outline", args: { target: /src\/api/ } },
      consolidated: { tool: "aft", action: "outline", args: { target: /src\/api/ } },
    },
  },
  {
    id: "zoom-symbol",
    prompt: "Read the full source of the handleRequest function in src/app.ts.",
    expect: {
      granular: { tool: "aft_zoom", args: { symbol: "handleRequest" } },
      consolidated: { tool: "aft", action: "zoom", args: { symbol: "handleRequest" } },
    },
  },
  {
    id: "search-pattern",
    prompt: "Find every console.log call in the TypeScript source, structurally rather than by text match.",
    expect: {
      granular: { tool: "aft_search", args: { pattern: /console\.log/ } },
      consolidated: { tool: "aft", action: "search", args: { pattern: /console\.log/ } },
    },
  },
  {
    id: "inspect-health",
    prompt: "You just finished a batch of edits. Check the codebase for compile and type errors before running tests.",
    expect: {
      granular: { tool: "aft_inspect" },
      consolidated: { tool: "aft", action: "inspect" },
    },
  },
  {
    // THE CAPABILITY BOUNDARY. A write task must land on the write tool. If a
    // consolidated read tool absorbs edit intent, the allowlist gate is moot —
    // this is the one failure that would make consolidation unsafe, not merely
    // less accurate.
    id: "edit-file",
    prompt: 'In src/app.ts, replace the text "const timeout = 30" with "const timeout = 60".',
    expect: {
      granular: { tool: "aft_edit", args: { newString: /60/ } },
      consolidated: { tool: "aft_edit", args: { newString: /60/ } },
    },
  },
  {
    // The mirror: a read task must NOT reach for the write tool.
    id: "read-not-edit",
    prompt: "Show me what the validateInput function in src/validate.ts currently does.",
    expect: {
      granular: { tool: "aft_zoom", args: { symbol: "validateInput" } },
      consolidated: { tool: "aft", action: "zoom", args: { symbol: "validateInput" } },
    },
  },
];
