import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSkill } from "../parse";

let dir = "";

function writeSkill(name: string, body: string): string {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const path = join(skillDir, "SKILL.md");
  writeFileSync(path, body);

  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wh-parse-"));
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
  vi.restoreAllMocks();
});

describe("parseSkill", () => {
  it("reports WH_SKILL_FRONTMATTER and returns nothing on unparseable YAML", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const path = writeSkill(
      "broken",
      "---\nname: x\n: : :\n\t- bad\n---\nBody.",
    );

    expect(parseSkill(path)).toBeUndefined();
    expect(error.mock.calls.flat().join("\n")).toContain(
      "WH_SKILL_FRONTMATTER",
    );
  });

  it("coerces non-string metadata values to strings", () => {
    const path = writeSkill(
      "meta",
      "---\nname: meta\ndescription: d\nmetadata:\n  count: 3\n---\nB.",
    );

    expect(parseSkill(path)?.metadata).toEqual({ count: "3" });
  });

  it("omits metadata when the map is empty or absent", () => {
    const path = writeSkill(
      "nometa",
      "---\nname: nometa\ndescription: d\n---\nB.",
    );

    expect(parseSkill(path)?.metadata).toBeUndefined();
  });

  it("ignores a non-object metadata value", () => {
    const path = writeSkill(
      "scalarmeta",
      "---\nname: scalarmeta\ndescription: d\nmetadata: nope\n---\nB.",
    );

    expect(parseSkill(path)?.metadata).toBeUndefined();
  });
});
