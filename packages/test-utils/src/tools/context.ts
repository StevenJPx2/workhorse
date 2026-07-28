// mockToolContext — assemble the four doubles into a ToolContext, and invoke
// a ToolFactory against it.
//
// A `tool()` returns a ToolFactory: call it with a ToolContext and you get a
// definition whose run({ input }) resolves to a string. No harness, no flue,
// no container. `runTool` collapses that to one line so a test reads as
// input → output, with the doubles reachable for assertions.

import type { Core, Env, SandboxHandle, ToolContext, ToolFactory } from "@workhorse/api";
import { fakeCore, type FakeCore, type FakeCoreOverrides } from "./core";
import { fakeEnv, type FakeEnvOptions } from "./env";
import { fakeSandbox, type FakeSandbox, type FakeSandboxOptions } from "./sandbox";

export interface MockToolContextOptions {
  /** Fake container config, or a ready-made handle. */
  sandbox?: FakeSandboxOptions | SandboxHandle;
  /** Fake core overrides, or a ready-made Core. */
  core?: FakeCoreOverrides | Core;
  /** Fake env config, or a ready-made Env. */
  env?: FakeEnvOptions | Env;
  /** Worker origin for self-referential callbacks. */
  selfOrigin?: string;
  /** The ticket + stage the tools serve. */
  ticket?: Partial<ToolContext["ticket"]>;
}

export interface MockToolContext extends ToolContext {
  sandbox: SandboxHandle;
  core: Core;
}

const isSandboxHandle = (v: unknown): v is SandboxHandle =>
  typeof v === "object" && v !== null && typeof (v as SandboxHandle).exec === "function";

const isCore = (v: unknown): v is Core =>
  typeof v === "object" && v !== null && typeof (v as Core).getTicket === "function" && "calls" in v;

const isEnv = (v: unknown): v is Env => typeof v === "object" && v !== null && "TICKET_WF" in v;

/**
 * Build a ToolContext backed by doubles. Every field is optional:
 * `mockToolContext()` yields a context where the container succeeds silently,
 * core returns empties, and untouched bindings throw a named error.
 */
export function mockToolContext(options: MockToolContextOptions = {}): MockToolContext {
  const sandbox = isSandboxHandle(options.sandbox) ? options.sandbox : fakeSandbox(options.sandbox);
  const core = isCore(options.core) ? options.core : fakeCore(options.core);
  const env = isEnv(options.env) ? options.env : fakeEnv(options.env);

  return {
    env,
    core,
    sandbox,
    selfOrigin: options.selfOrigin ?? "https://workhorse.test",
    ticket: {
      id: "t-abc123",
      repo: "acme/widgets",
      stage: "implement",
      ...options.ticket,
    },
  };
}

export interface RunToolResult<C extends MockToolContext = MockToolContext> {
  /** What the tool returned (tools always resolve to a string). */
  output: string;
  /** The context it ran against — assert on sandbox.execCalls, core.calls, … */
  ctx: C;
  /** The fake container, pre-narrowed (throws if a real handle was supplied). */
  sandbox: FakeSandbox;
  /** The fake core, pre-narrowed (throws if a real Core was supplied). */
  core: FakeCore;
}

/**
 * Invoke a tool with an input and return its output plus the doubles it
 * touched. The whole point: `const { output, sandbox } = await runTool(t, {...})`.
 */
export async function runTool(
  factory: ToolFactory,
  input: unknown = {},
  options: MockToolContextOptions = {},
): Promise<RunToolResult> {
  const ctx = mockToolContext(options);
  const definition = factory(ctx);
  const run = definition.run as (args: { input: unknown }) => string | Promise<string>;
  const output = await run({ input });

  return {
    output,
    ctx,
    get sandbox() {
      if (!("execCalls" in ctx.sandbox)) throw new Error("runTool: a real SandboxHandle was supplied, not a fake");
      return ctx.sandbox as FakeSandbox;
    },
    get core() {
      if (!("calls" in ctx.core)) throw new Error("runTool: a real Core was supplied, not a fake");
      return ctx.core as FakeCore;
    },
  };
}

/**
 * Build the tool definition without running it — for asserting on metadata
 * (name, description, schema) or driving run() manually.
 */
export function buildTool(factory: ToolFactory, options: MockToolContextOptions = {}) {
  const ctx = mockToolContext(options);
  return { definition: factory(ctx), ctx };
}
