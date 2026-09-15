import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import todo_write from "../todo_write";
import { TODO_FILE, type TodoDoc } from "../_store";

/** The JSON the tool persisted, parsed. */
const persisted = (sandbox: { writes: Array<{ path: string; content: string }> }): TodoDoc =>
  JSON.parse(sandbox.writes.at(-1)!.content);

describe("todo_write", () => {
  it("writes the todo list to the run workspace, outside the repo", async () => {
    const { sandbox } = await runTool(todo_write, { todos: [{ title: "first" }] });

    expect(sandbox.writes).toHaveLength(1);
    expect(sandbox.writes[0].path).toBe(TODO_FILE);
    // Outside the repo so it never pollutes the diff.
    expect(TODO_FILE.startsWith("/workspace/.workflow/")).toBe(true);
  });

  it("creates the workspace directory before writing", async () => {
    const { sandbox } = await runTool(todo_write, { todos: [{ title: "x" }] });
    expect(sandbox.ranCommandContaining("mkdir -p /workspace/.workflow")).toBe(true);
  });

  it("assigns sequential t<n> ids in the given order", async () => {
    const { sandbox } = await runTool(todo_write, {
      todos: [{ title: "alpha" }, { title: "beta" }, { title: "gamma" }],
    });

    const doc = persisted(sandbox);
    expect(doc.todos.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(doc.todos.map((t) => t.title)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("starts every todo pending", async () => {
    const { sandbox } = await runTool(todo_write, { todos: [{ title: "a" }, { title: "b" }] });
    expect(persisted(sandbox).todos.every((t) => t.status === "pending")).toBe(true);
  });

  it("numbers subtasks as <todoId>.<n> and starts them undone", async () => {
    const { sandbox } = await runTool(todo_write, {
      todos: [{ title: "parent", subtasks: ["one", "two"] }],
    });

    const [todo] = persisted(sandbox).todos;
    expect(todo.subtasks.map((s) => s.id)).toEqual(["t1.1", "t1.2"]);
    expect(todo.subtasks.map((s) => s.title)).toEqual(["one", "two"]);
    expect(todo.subtasks.every((s) => !s.done)).toBe(true);
  });

  it("keeps subtask numbering scoped to its own todo", async () => {
    const { sandbox } = await runTool(todo_write, {
      todos: [
        { title: "first", subtasks: ["a"] },
        { title: "second", subtasks: ["b", "c"] },
      ],
    });

    const doc = persisted(sandbox);
    expect(doc.todos[0].subtasks.map((s) => s.id)).toEqual(["t1.1"]);
    expect(doc.todos[1].subtasks.map((s) => s.id)).toEqual(["t2.1", "t2.2"]);
  });

  it("defaults subtasks to an empty array when omitted", async () => {
    const { sandbox } = await runTool(todo_write, { todos: [{ title: "bare" }] });
    expect(persisted(sandbox).todos[0].subtasks).toEqual([]);
  });

  it("replaces any existing list rather than appending", async () => {
    const existing: TodoDoc = {
      todos: [{ id: "t1", title: "old", status: "done", subtasks: [] }],
    };

    const { sandbox } = await runTool(
      todo_write,
      { todos: [{ title: "new" }] },
      { sandbox: { files: { [TODO_FILE]: JSON.stringify(existing) } } },
    );

    const doc = persisted(sandbox);
    expect(doc.todos).toHaveLength(1);
    expect(doc.todos[0].title).toBe("new");
    expect(doc.todos[0].status).toBe("pending");
  });

  it("rejects an empty list without writing", async () => {
    const { output, sandbox } = await runTool(todo_write, { todos: [] });

    expect(output).toContain("at least one todo");
    expect(sandbox.writes).toHaveLength(0);
  });

  it("returns the count and a rendered list", async () => {
    const { output } = await runTool(todo_write, {
      todos: [{ title: "visible", subtasks: ["sub"] }],
    });

    expect(output).toContain("Wrote 1 todo(s)");
    expect(output).toContain("[ ] t1 visible");
    expect(output).toContain("[ ] t1.1 sub");
  });

  it("persists formatted JSON that round-trips", async () => {
    const { sandbox } = await runTool(todo_write, { todos: [{ title: "round" }] });
    const raw = sandbox.writes[0].content;

    expect(raw).toContain("\n"); // pretty-printed, diffable
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
