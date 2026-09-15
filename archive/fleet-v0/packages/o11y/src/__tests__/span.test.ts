// withSpan: the custom-span helper for agent-facing routes.
//
// The route tests cannot run workerd, so these pin the CONTRACT: attrs set
// on the span, result propagated, error annotated, and a plain pass-through
// when tracing is unavailable (local dev, tests).

import { describe, expect, it, vi } from "vitest";
import { withSpan } from "../span";
import type { SpanLike, TracingLike } from "../span";

function fakeTracing(): TracingLike & { spans: Array<{ name: string; attrs: Record<string, unknown> }> } {
  const spans: Array<{ name: string; attrs: Record<string, unknown> }> = [];
  const tracing: TracingLike = {
    enterSpan<T>(name: string, callback: (span: SpanLike) => T): T {
      const attrs: Record<string, unknown> = {};
      const span: SpanLike = {
        setAttribute: (k, v) => {
          attrs[k] = v;
        },
        end: () => {},
      };
      spans.push({ name, attrs });
      return callback(span);
    },
  };
  return { ...tracing, spans };
}

describe("withSpan", () => {
  it("passes through when tracing is unavailable", async () => {
    const fn = vi.fn(async () => 42);
    expect(await withSpan({}, "span", { a: 1 }, fn)).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("opens a named span and sets the attrs", async () => {
    const tracing = fakeTracing();
    await withSpan({ tracing }, "fleet_chat", { messages: 3, repo: "acme/x" }, async () => "ok");

    expect(tracing.spans).toHaveLength(1);
    expect(tracing.spans[0].name).toBe("fleet_chat");
    expect(tracing.spans[0].attrs).toMatchObject({ messages: 3, repo: "acme/x" });
  });

  it("propagates the result", async () => {
    const tracing = fakeTracing();
    const r = await withSpan({ tracing }, "file_ticket", {}, async () => ({ ticket: "t1" }));
    expect(r).toEqual({ ticket: "t1" });
  });

  it("annotates and rethrows errors", async () => {
    const tracing = fakeTracing();
    await expect(
      withSpan({ tracing }, "semantic_find", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(tracing.spans[0].attrs.error).toBe("boom");
  });
});
