import { describe, expect, it } from "vitest";
import type { AgentExtension, AgentExtensionAPI } from "@workhorse/api";
import { installExtensions, personaExtension, writeGateExtension } from "../index";

/** Fake pi extension API: records handlers per event, invokable in tests. */
function fakeApi() {
  const handlers = new Map<string, (event: unknown) => unknown>();
  const api: AgentExtensionAPI = {
    on(event, handler) {
      handlers.set(event, handler);
    },
    registerTool() {},
  };
  return {
    api,
    handlers,
    fire: (event: string, payload: unknown) => handlers.get(event)?.(payload),
  };
}

describe("personaExtension", () => {
  it("appends the persona to the system prompt on before_agent_start", () => {
    const { api, fire } = fakeApi();
    personaExtension("You are a rigorous reviewer.").install(api);

    const out = fire("before_agent_start", { systemPrompt: "base prompt" });
    expect(out).toEqual({ systemPrompt: "base prompt\n\nYou are a rigorous reviewer." });
  });
});

describe("writeGateExtension", () => {
  it("blocks tool calls outside the allowlist with a reason", () => {
    const { api, fire } = fakeApi();
    writeGateExtension(new Set(["read", "submit_work"])).install(api);

    const out = fire("tool_call", { toolName: "bash", toolCallId: "c1", input: { cmd: "rm -rf /" } });
    expect(out).toEqual({ block: true, reason: "tool bash is not in this stage's allowlist", terminate: false });
  });

  it("passes tool calls inside the allowlist through", () => {
    const { api, fire } = fakeApi();
    writeGateExtension(new Set(["read", "submit_work"])).install(api);

    expect(fire("tool_call", { toolName: "submit_work", toolCallId: "c2", input: {} })).toBeUndefined();
  });
});

describe("installExtensions", () => {
  it("installs every extension and survives one that throws", () => {
    const { api, handlers } = fakeApi();
    const good: AgentExtension = {
      name: "good",
      install(a) {
        a.on("agent_end", () => "bye");
      },
    };
    const bad: AgentExtension = {
      name: "bad",
      install() {
        throw new Error("boom");
      },
    };

    expect(() => installExtensions(api as never, [good, bad])).not.toThrow();
    expect(handlers.has("agent_end")).toBe(true);
    expect(handlers.has("tool_call")).toBe(false);
  });
});
