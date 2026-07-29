// Fleet chat's guard rails.
//
// The harness itself belongs to flue, so what's worth testing here is everything
// AROUND it: the credential gate, prompt rendering, and turning a thrown harness
// error into an HTTP status instead of a 500 with a stack trace.

import { fakeCore, fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usable = vi.fn<() => Promise<string | null>>(async () => "sk-ant-oat01-fresh");
const prompt = vi.fn<(p: string) => Promise<{ text?: string }>>(async () => ({ text: "a reply" }));
const initializeRootHarness = vi.fn(async () => ({ session: async () => ({ prompt }) }));

vi.mock("../src/auth", () => ({ modelToken: () => ({ usable }) }));
vi.mock("../src/agent-run", () => ({ sandboxDriver: () => ({ exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }) }) }));
vi.mock("../src/registry", () => ({ assembleChatTools: () => [] }));
vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({}) }));
vi.mock("@flue/runtime", () => ({ defineAgent: (f: unknown) => f, registerProvider: vi.fn() }));
vi.mock("@flue/runtime/cloudflare", () => ({ cloudflareSandbox: () => ({}) }));
vi.mock("@flue/runtime/internal", () => ({
  createFlueContext: () => ({ initializeRootHarness }),
  resolveModel: (m: string) => m,
}));

const { runFleetChat } = await import("../src/chat");

const env = fakeEnv();
const core = fakeCore();
const chat = (messages = [{ role: "user", content: "how many tickets are open?" }]) =>
  runFleetChat(env, core, "https://workhorse.test", messages);

beforeEach(() => {
  vi.clearAllMocks();
  usable.mockResolvedValue("sk-ant-oat01-fresh");
  prompt.mockResolvedValue({ text: "a reply" });
  initializeRootHarness.mockResolvedValue({ session: async () => ({ prompt }) });
});

describe("credential gate", () => {
  it("refuses with 503 when no usable token exists", async () => {
    usable.mockResolvedValue(null);

    expect(await chat()).toMatchObject({ ok: false, status: 503 });
  });

  it("does not start a harness without a token", async () => {
    usable.mockResolvedValue(null);
    await chat();

    expect(initializeRootHarness).not.toHaveBeenCalled();
  });

  it("requires START runway, not stage runway", async () => {
    await chat();

    // Chat is a fresh interaction, so it should refuse to begin on fumes rather
    // than start and die mid-reply.
    expect(usable).toHaveBeenCalledWith(10 * 60 * 1000);
  });
});

describe("replies", () => {
  it("returns the agent's reply", async () => {
    expect(await chat()).toEqual({ ok: true, reply: "a reply" });
  });

  it("trims the reply", async () => {
    prompt.mockResolvedValue({ text: "  padded  \n" });

    expect(await chat()).toEqual({ ok: true, reply: "padded" });
  });

  it("treats an empty reply as 502, not success", async () => {
    prompt.mockResolvedValue({ text: "   " });

    // An empty string would render as a blank chat bubble, which reads as the
    // fleet ignoring the operator.
    expect(await chat()).toMatchObject({ ok: false, status: 502 });
  });

  it("treats a missing text field as 502", async () => {
    prompt.mockResolvedValue({});

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
  it("turns a harness failure into a 500 with a bounded message", async () => {
    initializeRootHarness.mockRejectedValue(new Error("x".repeat(2000)));
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
