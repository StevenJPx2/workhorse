import { describe, expect, it } from "vitest";

import { defineScript } from "../define";
import { renderHelp } from "../help";

describe("renderHelp", () => {
  it("renders synopsis, arguments, and options sections", () => {
    const script = defineScript({
      args: {
        options: [
          { alias: "v", description: "Verbose output", name: "verbose" },
          { description: "Dry run", name: "dry-run" },
        ],
        positional: [
          { description: "Target file", name: "file", required: true },
          { default: "main", description: "Branch", name: "branch" },
        ],
      },
      command: "echo hi",
      description: "Do a thing",
      name: "doit",
    });

    const help = renderHelp(script);
    expect(help).toContain("Usage: doit <file> [branch] [options]");
    expect(help).toContain("Do a thing");
    expect(help).toContain("  file (required) — Target file");
    expect(help).toContain("  branch (default: main) — Branch");
    expect(help).toContain("  --verbose, -v — Verbose output");
    expect(help).toContain("  --dry-run — Dry run");
  });

  it("omits empty sections for a script with no args", () => {
    const script = defineScript({
      command: "echo hi",
      description: "Bare",
      name: "bare",
    });
    const help = renderHelp(script);
    expect(help).toBe("Usage: bare\n\nBare");
  });
});
