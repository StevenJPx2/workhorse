// Cron validation, matching, and template rendering.
//
// `fallow fix` offered to un-export all three as unused. They are used
// internally, so hiding them would have been the letter of the finding and the
// opposite of its intent: cron matching decides whether scheduled work runs at
// all, and an off-by-one here is a trigger that silently never fires.

import { describe, expect, it } from "vitest";
import { cronMatches, renderTemplate, validateCron } from "../triggers";

/** A UTC instant, for readable cron assertions. */
const at = (iso: string) => new Date(iso);

describe("validateCron", () => {
  it("accepts a five-field expression", () => {
    expect(validateCron("*/15 * * * *")).toBeNull();
    expect(validateCron("0 9 * * 1")).toBeNull();
  });

  it("rejects the wrong field count", () => {
    // Six fields is the seconds-precision form other schedulers accept; ours
    // would silently misread every field by one position.
    expect(validateCron("* * * *")).toContain("5 fields");
    expect(validateCron("0 0 * * * *")).toContain("5 fields");
  });

  it("accepts ranges, lists, and steps", () => {
    expect(validateCron("0 9-17 * * 1-5")).toBeNull();
    expect(validateCron("0,30 * * * *")).toBeNull();
    expect(validateCron("0 */4 * * *")).toBeNull();
    expect(validateCron("0-59/10 * * * *")).toBeNull();
  });

  it("rejects a field that is out of range", () => {
    expect(validateCron("60 * * * *")).toContain("out of range");
    expect(validateCron("* 24 * * *")).toContain("out of range");
    expect(validateCron("* * 32 * *")).toContain("out of range");
    expect(validateCron("* * * 13 *")).toContain("out of range");
    expect(validateCron("* * * * 7")).toContain("out of range");
  });

  it("accepts the boundary values of each field", () => {
    expect(validateCron("59 23 31 12 6")).toBeNull();
    expect(validateCron("0 0 1 1 0")).toBeNull();
  });

  it("rejects nonsense in a field", () => {
    expect(validateCron("abc * * * *")).toContain("bad cron field");
    expect(validateCron("* * * * mon")).toContain("bad cron field");
  });

  it("tolerates surrounding whitespace", () => {
    expect(validateCron("  0 9 * * 1  ")).toBeNull();
  });
});

describe("cronMatches", () => {
  it("matches every minute for all-wildcards", () => {
    expect(cronMatches("* * * * *", at("2026-07-29T13:47:00Z"))).toBe(true);
  });

  it("matches an exact minute and hour", () => {
    expect(cronMatches("30 9 * * *", at("2026-07-29T09:30:00Z"))).toBe(true);
    expect(cronMatches("30 9 * * *", at("2026-07-29T09:31:00Z"))).toBe(false);
    expect(cronMatches("30 9 * * *", at("2026-07-29T10:30:00Z"))).toBe(false);
  });

  it("matches a step field", () => {
    expect(cronMatches("*/15 * * * *", at("2026-07-29T13:00:00Z"))).toBe(true);
    expect(cronMatches("*/15 * * * *", at("2026-07-29T13:15:00Z"))).toBe(true);
    expect(cronMatches("*/15 * * * *", at("2026-07-29T13:16:00Z"))).toBe(false);
  });

  it("matches a comma list", () => {
    expect(cronMatches("0,30 * * * *", at("2026-07-29T13:00:00Z"))).toBe(true);
    expect(cronMatches("0,30 * * * *", at("2026-07-29T13:30:00Z"))).toBe(true);
    expect(cronMatches("0,30 * * * *", at("2026-07-29T13:15:00Z"))).toBe(false);
  });

  it("matches an inclusive range", () => {
    // 2026-07-29 is a Wednesday.
    expect(cronMatches("0 9-17 * * *", at("2026-07-29T09:00:00Z"))).toBe(true);
    expect(cronMatches("0 9-17 * * *", at("2026-07-29T17:00:00Z"))).toBe(true);
    expect(cronMatches("0 9-17 * * *", at("2026-07-29T18:00:00Z"))).toBe(false);
  });

  it("matches a range with a step, anchored at the range start", () => {
    expect(cronMatches("0-30/10 * * * *", at("2026-07-29T13:00:00Z"))).toBe(true);
    expect(cronMatches("0-30/10 * * * *", at("2026-07-29T13:10:00Z"))).toBe(true);
    expect(cronMatches("0-30/10 * * * *", at("2026-07-29T13:15:00Z"))).toBe(false);
  });

  it("matches day-of-week, where Sunday is 0", () => {
    // 2026-07-26 is a Sunday, 2026-07-29 a Wednesday.
    expect(cronMatches("0 0 * * 0", at("2026-07-26T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 * * 3", at("2026-07-29T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 * * 0", at("2026-07-29T00:00:00Z"))).toBe(false);
  });

  it("matches month as 1-12, not 0-11", () => {
    // A JS Date's month is zero-based; cron's is not. Getting this wrong would
    // fire every monthly trigger a month early.
    expect(cronMatches("0 0 1 7 *", at("2026-07-01T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 1 6 *", at("2026-07-01T00:00:00Z"))).toBe(false);
  });

  it("matches day-of-month", () => {
    expect(cronMatches("0 0 29 * *", at("2026-07-29T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 28 * *", at("2026-07-29T00:00:00Z"))).toBe(false);
  });

  it("evaluates in UTC, not the host timezone", () => {
    // The worker's scheduled handler runs on UTC; matching in local time would
    // shift every schedule by the runner's offset.
    expect(cronMatches("0 0 * * *", at("2026-07-29T00:00:00Z"))).toBe(true);
  });

  it("requires EVERY field to match", () => {
    expect(cronMatches("0 9 29 7 3", at("2026-07-29T09:00:00Z"))).toBe(true);
    expect(cronMatches("0 9 29 7 4", at("2026-07-29T09:00:00Z"))).toBe(false);
  });
});

describe("renderTemplate", () => {
  it("substitutes a placeholder", () => {
    expect(renderTemplate("Fix {{issue}}", { issue: "#42" })).toBe("Fix #42");
  });

  it("substitutes the same placeholder everywhere it appears", () => {
    expect(renderTemplate("{{a}} and {{a}}", { a: "x" })).toBe("x and x");
  });

  it("substitutes several placeholders", () => {
    expect(renderTemplate("{{a}}/{{b}}", { a: "one", b: "two" })).toBe("one/two");
  });

  it("drops an unknown placeholder to an empty string", () => {
    // PINNED, not endorsed. A fully-empty render is caught downstream
    // (fireTrigger rejects with "template rendered empty"), but a PARTIAL one is
    // not: a webhook payload missing one field files a ticket whose prompt reads
    // as a complete instruction with a hole in it — "Fix " here.
    //
    // Leaving the literal {{unset}} in place would make the gap visible to the
    // agent. Changing it is a behaviour change, not a test fix, so it is recorded
    // here rather than silently altered.
    expect(renderTemplate("Fix {{unset}}", {})).toBe("Fix ");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Fix {{ issue }}", { issue: "#42" })).toBe("Fix #42");
  });

  it("returns a template with no placeholders unchanged", () => {
    expect(renderTemplate("nothing to do", { a: "x" })).toBe("nothing to do");
  });

  it("does not treat a substituted value as a template", () => {
    // Otherwise a payload could inject its own placeholders and read values it
    // was never given.
    expect(renderTemplate("{{a}}", { a: "{{b}}", b: "leaked" })).toBe("{{b}}");
  });
});
