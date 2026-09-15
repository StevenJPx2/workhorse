// Custom trace spans for agent-facing fetch routes.
//
// Workflow steps carry no ExecutionContext, so stage sessions can't open
// custom spans from inside step.do — the runtime auto-traces every workflow
// step, binding call, and outbound model fetch anyway. Custom spans here
// name the agent boundaries (file, chat, semantic find) that auto-spans
// don't label, so the waterfall reads as a ticket lifecycle rather than a
// blob of fetch calls.

export interface SpanLike {
  setAttribute(key: string, value: string | number | boolean | undefined): void;
  end(): void;
}

export interface TracingLike {
  enterSpan<T>(name: string, callback: (span: SpanLike) => T): T;
}

/** Run fn under a named custom span; plain fn when tracing is unavailable. */
export function withSpan<T>(
  ctx: { tracing?: TracingLike },
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const tracing = ctx?.tracing;
  if (!tracing) return fn();
  // enterSpan auto-ends when the callback's promise settles.
  return tracing.enterSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
    try {
      return await fn();
    } catch (e) {
      span.setAttribute("error", String((e as Error)?.message ?? e).slice(0, 200));
      throw e;
    }
  });
}
