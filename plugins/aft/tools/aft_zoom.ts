// aft_zoom — read the full source of a named symbol or a doc heading section (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_zoom",
  description:
    "Read the full source of a named symbol (function/class/type) in a file, or a section " +
    "under a Markdown/HTML heading. Precise symbol-level reading without dumping the whole file.",
  input: v.object({ filePath: v.string(), symbol: v.string(), contextLines: v.optional(v.number()) }),
  run: ({ input, sandbox }) =>
    aft(sandbox, [
      "zoom",
      "--json",
      "--file",
      input.filePath,
      "--symbol",
      input.symbol,
      ...(input.contextLines ? ["--context", String(input.contextLines)] : []),
    ]),
});
