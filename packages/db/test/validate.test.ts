// Script validation is a trust boundary: an agent registers scripts through a
// tool, so these are adversarial inputs, not typos.

import { describe, expect, it } from "vitest";
import { validateScript } from "../src/validate";

const valid = { name: "run_tests", code: "return 1;", scope: "global" };

describe("accepts", () => {
  it("a minimal valid script", () => {
    expect(validateScript(valid)).toBeNull();
  });

  it("a repo scope", () => {
    expect(validateScript({ ...valid, scope: "repo:acme/widgets" })).toBeNull();
  });

  it("args and gates when well-formed", () => {
    expect(
      validateScript({
        ...valid,
        args: [{ name: "target", description: "what", required: true }],
        statusGates: ["planning", "implementing"],
      }),
    ).toBeNull();
  });

  it("hyphens and digits in a name", () => {
    expect(validateScript({ ...valid, name: "run-tests-2" })).toBeNull();
  });
});

describe("rejects names", () => {
  it.each([
    ["", "empty"],
    ["A", "uppercase start"],
    ["1abc", "digit start"],
    ["_abc", "underscore start"],
    ["a", "single char (min 2)"],
    ["a b", "space"],
    ["a/b", "slash"],
    ["a.b", "dot"],
    [`a${"x".repeat(70)}`, "over 64 chars"],
  ])("%s — %s", (name) => {
    expect(validateScript({ ...valid, name })).toContain("name must match");
  });
});

describe("rejects code", () => {
  it("missing", () => {
    expect(validateScript({ ...valid, code: undefined })).toBe("code required");
  });

  it("whitespace only", () => {
    expect(validateScript({ ...valid, code: "   \n\t " })).toBe("code required");
  });

  it("over 16 KiB", () => {
    expect(validateScript({ ...valid, code: "x".repeat(16_385) })).toContain("too long");
  });

  it("but allows exactly 16 KiB", () => {
    expect(validateScript({ ...valid, code: "x".repeat(16_384) })).toBeNull();
  });
});

describe("rejects scope", () => {
  it.each([[undefined], [""], ["repo"], ["global2"], ["user:me"]])("%s", (scope) => {
    expect(validateScript({ ...valid, scope })).toContain("scope must be");
  });
});

describe("rejects args", () => {
  it("a non-array", () => {
    expect(validateScript({ ...valid, args: { name: "x" } })).toBe("args must be an array");
  });

  it("an arg with no name", () => {
    expect(validateScript({ ...valid, args: [{ description: "no name" }] })).toContain("each arg needs a name");
  });

  it("an arg name that is not an identifier", () => {
    expect(validateScript({ ...valid, args: [{ name: "my-arg" }] })).toContain("each arg needs a name");
  });

  it("a null entry", () => {
    // A null in the array would crash a naive `a.name` read.
    expect(validateScript({ ...valid, args: [null] })).toContain("each arg needs a name");
  });

  it("but allows an empty array", () => {
    expect(validateScript({ ...valid, args: [] })).toBeNull();
  });
});

describe("rejects statusGates", () => {
  it("a non-array", () => {
    expect(validateScript({ ...valid, statusGates: "planning" })).toBe("statusGates must be an array");
  });

  it("an unknown status", () => {
    expect(validateScript({ ...valid, statusGates: ["nonsense"] })).toContain('unknown status gate "nonsense"');
  });

  it("a terminal status", () => {
    // Gating on `done` would mean a script that can only run once the ticket is
    // finished — meaningless, and a sign the caller misunderstood the field.
    expect(validateScript({ ...valid, statusGates: ["done"] })).toContain("unknown status gate");
  });

  it("an operator-waiting status", () => {
    expect(validateScript({ ...valid, statusGates: ["awaiting-input"] })).toContain("unknown status gate");
  });

  it("but allows every active status", () => {
    expect(
      validateScript({
        ...valid,
        statusGates: ["queued", "planning", "implementing", "ready-for-review", "in-review"],
      }),
    ).toBeNull();
  });
});
