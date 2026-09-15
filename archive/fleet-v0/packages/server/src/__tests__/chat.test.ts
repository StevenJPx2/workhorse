// Fleet chat's guard rails.
//
// The agent loop itself belongs to pi, so what's worth testing here is
// everything AROUND it: the credential gate, prompt rendering, and turning a
// thrown session error into an HTTP status instead of a 500 with a stack trace.

import { fakeCore, fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The agent's last turn: the reply is read from the session transcript
// (pi's prompt resolves to void), so the mock's state mirrors the prompt.
let lastReply: string | undefined = "a reply";
const prompt = vi.fn<(p: string) => Promise<{ text?: string }>>(async () => ({ text: lastReply }));
const piSessionMock = vi.fn(async () => ({
  prompt,
  dispose: vi.fn(),
  state: {
    get messages() {
      return [{ role: "assistant", content: lastReply ?? "" }];
    },
  },
}));

// The whole package, not just the driver: its barrel also exports codemode,
// which imports `cloudflare:workers` — unavailable outside workerd.
vi.mock("@workhorse/sandbox", () => ({
  sandboxDriver: () => ({ exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) }),
}));
vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({}) }));
// The pi adapter is mocked at the module boundary: a real piSession would
// spin up a live model runtime and call the provider with the fake key.
vi.mock("@workhorse/pi", () => ({
  piSession: piSessionMock,
  toPiTool: (t: unknown) => t,
}));

const { runFleetChat } = await import("../chat");

const env = fakeEnv();
const core = fakeCore();
const chat = (messages = [{ role: "user", content: "how many tickets are open?" }], e = env) =>
  // Chat tools are injected now (they read the plugin registry), so the suite
  // supplies an empty surface rather than mocking a module.
  runFleetChat(e, core, "https://workhorse.test", messages, () => [], () => []);

beforeEach(() => {
  vi.clearAllMocks();
  prompt.mockResolvedValue({ text: "a reply" });
});

describe("key gate", () => {
  it("refuses with 503 when OPENCODE_API_KEY is unset", async () => {
    expect(await chat(undefined, { ...env, OPENCODE_API_KEY: undefined })).toMatchObject({ ok: false, status: 503 });
  });

  it("does not start a harness without the key", async () => {
    await chat(undefined, { ...env, OPENCODE_API_KEY: undefined });

    expect(piSessionMock).not.toHaveBeenCalled();
  });
});

describe("replies", () => {
  it("returns the agent's reply", async () => {
    expect(await chat()).toEqual({ ok: true, reply: "a reply" });
  });

  it("trims the reply", async () => {
    lastReply = "  padded  \n";

    expect(await chat()).toEqual({ ok: true, reply: "padded" });
  });

  it("treats an empty reply as 502, not success", async () => {
    lastReply = "   ";

    // An empty string would render as a blank chat bubble, which reads as the
    // fleet ignoring the operator.
    expect(await chat()).toMatchObject({ ok: false, status: 502 });
  });

  it("treats a missing text field as 502", async () => {
    lastReply = undefined;

    expect(await chat()).toMatchObject({ ok: false, status: 502 });
  });
});

describe("prompt rendering", () => {
  it("labels the operator as User and the agent as You", async () => {
    await chat([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ]);

    const sent = prompt.mock.calls[0][0];
    expect(sent).toContain("User: first");
    expect(sent).toContain("You: second");
    expect(sent).toContain("User: third");
  });

  it("asks for a reply to the LAST message", async () => {
    await chat();

    expect(prompt.mock.calls[0][0]).toContain("Reply to the last user message");
  });

  it("handles a single message", async () => {
    await chat([{ role: "user", content: "hello" }]);

    expect(prompt.mock.calls[0][0]).toContain("User: hello");
  });
});

describe("failure handling", () => {
  it("turns a session failure into a 500 with a bounded message", async () => {
    piSessionMock.mockRejectedValueOnce(new Error("x".repeat(2000)));
    const r = await chat();

    expect(r).toMatchObject({ ok: false, status: 500 });
    // Bounded: an unbounded provider error would be pasted into a chat bubble.
    expect((r as { error: string }).error.length).toBeLessThan(500);
  });

  it("turns a prompt failure into a 500 rather than throwing", async () => {
    prompt.mockRejectedValue(new Error("model refused"));
    const r = await chat();

    expect(r).toMatchObject({ ok: false, status: 500 });
    expect((r as { error: string }).error).toContain("model refused");
  });

  it("handles a non-Error rejection", async () => {
    prompt.mockRejectedValue("just a string");

    expect(await chat()).toMatchObject({ ok: false, status: 500 });
  });
});
