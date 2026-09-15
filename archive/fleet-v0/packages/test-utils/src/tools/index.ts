// @workhorse/test-utils/tools — doubles for the plugin tool contract.
//
// A tool is a pure function of its ToolContext: give it a fake container, a
// fake Core, and fake bindings, and it is testable in-process with no harness
// and no network.
//
//   const { output, sandbox } = await runTool(todo_write, { todos: [{ title: "x" }] });
//   expect(sandbox.writes[0].path).toBe("/workspace/.workflow/todos.json");

export { fakeSandbox } from "./sandbox";
export type { ExecCall, ExecResponder, ExecResult, FakeSandbox, FakeSandboxOptions } from "./sandbox";

export { fakeCore, fakeScript, fakeTicket } from "./core";
export type { CoreCall, FakeCore, FakeCoreOverrides } from "./core";

export { fakeAiSearch, fakeEnv, fakeKV } from "./env";
export type { FakeAiSearch, FakeAiSearchOptions, FakeEnvOptions, FakeKV, FakeSearchChunk, FakeUpload } from "./env";

export { stubFetch } from "./fetch";
export type { RecordedRequest, RouteResponder, StubFetchHandle } from "./fetch";

export { buildTool, mockToolContext, runTool } from "./context";
export type { MockToolContext, MockToolContextOptions, RunToolResult } from "./context";
