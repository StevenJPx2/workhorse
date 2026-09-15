import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import todo_update from "../todo_update";
import { TODO_FILE, type TodoDoc } from "../_store";

const doc = (): TodoDoc => ({
  todos: [
    {
      id: "t1",
      title: "first",
      status: "pending",
      subtasks: [
        { id: "t1.1", title: "sub one", done: false },
        { id: "t1.2", title: "sub two", done: false },
      ],
    },
    { id: "t2", title: "second", status: "pending", subtasks: [] },
  ],
});

const withDoc = (d: TodoDoc = doc()) => ({ sandbox: { files: { [TODO_FILE]: JSON.stringify(d) } } });

const persisted = (sandbox: { writes: Array<{ content: string }> }): TodoDoc =>
  JSON.parse(sandbox.writes.at(-1)!.content);

describe("todo_update", () => {
  it("sets a todo in_progress", async () => {
    const { sandbox } = await runTool(todo_update, { id: "t1", status: "in_progress" }, withDoc());
    expect(persisted(sandbox).todos[0].status).toBe("in_progress");
  });

  it("sets a todo done — the signal that advances the workflow", async () => {
    const { sandbox } = await runTool(todo_update, { id: "t1", status: "done" }, withDoc());
    expect(persisted(sandbox).todos[0].status).toBe("done");
  });

  it("leaves other todos untouched", async () => {
    const { sandbox } = await runTool(todo_update, { id: "t1", status: "done" }, withDoc());
    expect(persisted(sandbox).todos[1]).toEqual({ id: "t2", title: "second", status: "pending", subtasks: [] });
  });

  it("ticks a subtask by id", async () => {
    const { sandbox } = await runTool(todo_update, { id: "t1", subtaskDone: "t1.2" }, withDoc());

    const [todo] = persisted(sandbox).todos;
    expect(todo.subtasks.find((s) => s.id === "t1.2")?.done).toBe(true);
    expect(todo.subtasks.find((s) => s.id === "t1.1")?.done).toBe(false);
  });

  it("applies status and subtask in one call", async () => {
    const { sandbox } = await runTool(
      todo_update,
      { id: "t1", status: "in_progress", subtaskDone: "t1.1" },
      withDoc(),
    );

    const [todo] = persisted(sandbox).todos;
    expect(todo.status).toBe("in_progress");
    expect(todo.subtasks[0].done).toBe(true);
  });

  it("is idempotent — re-ticking a done subtask keeps it done", async () => {
    const d = doc();
    d.todos[0].subtasks[0].done = true;

    const { sandbox } = await runTool(todo_update, { id: "t1", subtaskDone: "t1.1" }, withDoc(d));
    expect(persisted(sandbox).todos[0].subtasks[0].done).toBe(true);
  });

  it("reports an unknown todo id with the current list, and does not write", async () => {
    const { output, sandbox } = await runTool(todo_update, { id: "t99", status: "done" }, withDoc());

    expect(output).toContain('no todo "t99"');
    expect(output).toContain("[ ] t1 first"); // list included for orientation
    expect(sandbox.writes).toHaveLength(0);
  });

  it("reports an unknown subtask id and does not write", async () => {
    const { output, sandbox } = await runTool(todo_update, { id: "t1", subtaskDone: "t1.9" }, withDoc());

    expect(output).toContain('no subtask "t1.9"');
    expect(sandbox.writes).toHaveLength(0);
  });

  it("does not apply a status change when the subtask id is bad", async () => {
    // The status assignment happens before subtask lookup; the early return
    // must prevent it from being persisted.
    const { sandbox } = await runTool(
      todo_update,
      { id: "t1", status: "done", subtaskDone: "nope" },
      withDoc(),
    );
    expect(sandbox.writes).toHaveLength(0);
  });

  it("handles a status-only call on a todo with no subtasks", async () => {
    const { sandbox } = await runTool(todo_update, { id: "t2", status: "done" }, withDoc());
    expect(persisted(sandbox).todos[1].status).toBe("done");
  });

  it("returns the updated list", async () => {
    const { output } = await runTool(todo_update, { id: "t1", status: "done" }, withDoc());

    expect(output).toContain("Updated t1");
    expect(output).toContain("[x] t1 first");
  });

  it("writes back to the same workspace path", async () => {
    const { sandbox } = await runTool(todo_update, { id: "t1", status: "done" }, withDoc());
    expect(sandbox.writes[0].path).toBe(TODO_FILE);
  });

  it("reports no todo when the list is missing entirely", async () => {
    const { output, sandbox } = await runTool(todo_update, { id: "t1", status: "done" });

    expect(output).toContain('no todo "t1"');
    expect(sandbox.writes).toHaveLength(0);
  });
});
