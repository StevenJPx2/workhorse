// Fake Core — the worker-services double.
//
// Core is the ONLY way a plugin reaches core behavior, so faking it covers
// every non-container tool. Each method defaults to a benign empty answer;
// a test overrides just the one or two it exercises. Calls are recorded so a
// test can assert the ARGUMENTS a tool passed (e.g. that a query was
// truncated, or a repo scope was forwarded).

import type { Core, ExternalEvent, ResolvedAttachment, ScriptRecord, TicketRecord } from "@workhorse/api";

export interface CoreCall {
  method: keyof Core;
  args: unknown[];
}

export type FakeCoreOverrides = Partial<Core>;

export interface FakeCore extends Core {
  /** Every Core method call, in order. */
  readonly calls: CoreCall[];
  /** Calls to one method, in order. */
  callsTo(method: keyof Core): CoreCall[];
}

/** A plausible ticket record — override the fields a test cares about. */
export function fakeTicket(overrides: Partial<TicketRecord> = {}): TicketRecord {
  return {
    id: "t-abc123",
    title: "Fix the thing",
    repo: "https://github.com/acme/widgets.git",
    prompt: "Fix the thing that is broken",
    status: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A plausible script record — override the fields a test cares about. */
export function fakeScript(overrides: Partial<ScriptRecord> = {}): ScriptRecord {
  return {
    scope: "global",
    name: "hello",
    description: "Say hello",
    code: "return 'hello';",
    args: [],
    statusGates: [],
    createdBy: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Build a fake Core. Unspecified methods return benign empties (null, [], ok)
 * rather than throwing, so a tool under test fails on its own logic instead of
 * on scaffolding it never touches.
 */
export function fakeCore(overrides: FakeCoreOverrides = {}): FakeCore {
  const calls: CoreCall[] = [];

  const record = <K extends keyof Core>(method: K, impl: Core[K]): Core[K] =>
    (async (...args: unknown[]) => {
      calls.push({ method, args });
      const override = overrides[method] as ((...a: unknown[]) => unknown) | undefined;
      const fn = (override ?? impl) as (...a: unknown[]) => unknown;
      return fn(...args);
    }) as Core[K];

  return {
    calls,
    callsTo: (method) => calls.filter((c) => c.method === method),

    getTicket: record("getTicket", async (): Promise<TicketRecord | null> => null),
    listTickets: record("listTickets", async (): Promise<TicketRecord[]> => []),
    ticketDiff: record("ticketDiff", async (): Promise<string | null> => null),
    findWorkflows: record("findWorkflows", async () => []),
    resolveAttachment: record("resolveAttachment", async (): Promise<ResolvedAttachment | null> => null),
    fileTicket: record("fileTicket", async () => ({ ok: true as const, ticket: fakeTicket() })),
    appendEvents: record("appendEvents", async (_events: ExternalEvent[]) => {}),
    wakeTicket: record("wakeTicket", async () => {}),
    appendSteer: record("appendSteer", async () => {}),
    notify: record("notify", async () => {}),
    signalTransition: record("signalTransition", async () => {}),
    fleetChat: record("fleetChat", async () => ({ ok: true as const, reply: "hello from the fleet" })),
    listScripts: record("listScripts", async (): Promise<ScriptRecord[]> => []),
    getScriptByName: record("getScriptByName", async (): Promise<ScriptRecord | null> => null),
    registerScript: record("registerScript", async () => ({ ok: true as const, script: fakeScript() })),
    fireTrigger: record("fireTrigger", async () => ({ ok: true as const, ticket: fakeTicket() })),
  };
}
