import type { Env } from "@workhorse/api";
import { coding } from "@workhorse/workflow-coding";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  sessions: [] as Array<{ stageId: string; tools: string[]; persona: string }>,
  commands: [] as string[],
}));

vi.mock("@workhorse/sandbox", () => ({
  sandboxDriver: () => ({
    async exec(command: string) {
      state.commands.push(command);
      return { exitCode: 0, stdout: command.includes("git diff") ? "README.md | 1 +" : "", stderr: "" };
    },
    async readFile(path: string) {
      return state.files.get(path) ?? null;
    },
    async writeFile(path: string, content: string) {
      state.files.set(path, content);
    },
  }),
}));

vi.mock("../src/flue-session", () => ({
  makeStageSession: () => async (input: { dir: string; stageId: string; tools: string[]; persona: string }) => {
    state.sessions.push({ stageId: input.stageId, tools: input.tools, persona: input.persona });

    const output = {
      enrich: { control: {}, analysis: "grounded brief" },
      plan: { control: { todos: [{ id: "todo-1", title: "make the change" }] }, analysis: "one todo" },
      implement: { control: { uiChanges: false, todosRemaining: 0, todoId: "todo-1" }, analysis: "implemented" },
      review: { control: { verdict: "pass", blocking: [], nits: [] }, analysis: "review passed" },
      "pr-write": { control: {}, analysis: "PR body" },
    }[input.stageId];

    if (!output) throw new Error(`unexpected stage ${input.stageId}`);
    await state.files.set(`${input.dir}/control.json`, JSON.stringify(output.control));
    await state.files.set(`${input.dir}/analysis.md`, output.analysis);
    return { ok: true as const, stats: { tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 }, runCodeCalls: 0 } };
  },
}));

const { runWorkflow } = await import("../src/workflow-run");

describe("workflow() runtime adapter", () => {
  beforeEach(() => {
    state.files.clear();
    state.sessions.length = 0;
    state.commands.length = 0;
  });

  it("runs the typed coding workflow without reading Markdown personas", async () => {
    const result = await runWorkflow({
      env: { SELF_URL: "https://worker.test" } as Env,
      sandboxId: "ticket-test",
      selfOrigin: "https://worker.test",
      ticketId: "ticket-test",
      repo: "https://github.com/acme/widgets.git",
      workflow: coding,
      runId: "run-test",
      task: "make the change",
      inputs: {},
    });

    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.outcome).toBe("pr");
    expect(result.activity.tasks.map((task) => task.id)).toEqual([
      "enrich",
      "plan",
      "implement",
      "review",
      "pr-write",
    ]);
    expect(state.sessions.map((session) => session.stageId)).toEqual(result.activity.tasks.map((task) => task.id));
    expect(state.sessions.find((session) => session.stageId === "implement")?.tools).toContain("run_code");
    expect(state.sessions.find((session) => session.stageId === "implement")?.tools).toContain("run_script");
    expect(state.sessions.find((session) => session.stageId === "enrich")?.persona).toContain("You are the enricher");
    expect([...state.files.keys()].some((path) => path.endsWith("/prompt.md"))).toBe(true);
    expect([...state.files.keys()].some((path) => path.includes("/agents/"))).toBe(false);
  });
});
