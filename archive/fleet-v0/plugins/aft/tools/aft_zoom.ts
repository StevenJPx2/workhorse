// aft_zoom — read one symbol's full source (read-only).
//
// The reply is structured ({name, kind, range, content}), not a `text` blob, so
// this renders it into something an agent reads at a glance.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft, type AftReply } from "./_shared";

export default tool({
  name: "aft_zoom",
  description:
    "Read the full source of a named symbol (function, class, type) in a file. Precise and " +
    "token-cheap — far better than reading the whole file to find one function.",
  docs: `
aft_zoom — read one symbol's full source.

ARGUMENTS
  filePath      (required) the file
  symbol        (required) the symbol name
  contextLines  lines of surrounding context

OUTPUT
  The symbol's kind, its line range, and its full source including the doc
  comment above it.

EXAMPLES

  { filePath: "src/app.ts", symbol: "handleRequest" }
  { filePath: "src/db.ts", symbol: "Database", contextLines: 10 }

NOTES
  Use after aft_outline, which tells you what symbols exist. An unknown symbol
  is reported rather than silently returning nothing.
`,
  input: v.object({
    filePath: v.string(),
    symbol: v.string(),
    contextLines: v.optional(v.number()),
  }),
  run: ({ input, sandbox }) =>
    aft(
      sandbox,
      "zoom",
      {
        file: input.filePath,
        symbol: input.symbol,
        ...(input.contextLines ? { context: input.contextLines } : {}),
      },
      renderSymbol,
    ),
});

/** Render zoom's structured reply as a readable header plus source. */
function renderSymbol(reply: AftReply): string {
  const range = reply.range as { start_line?: number; end_line?: number } | undefined;
  const where = range?.start_line ? ` ${range.start_line}:${range.end_line ?? range.start_line}` : "";
  const header = `${reply.kind ?? "symbol"} ${reply.name ?? "?"}${where}`;
  const content = typeof reply.content === "string" ? reply.content : "";

  return content ? `${header}\n\n${content}` : header;
}
