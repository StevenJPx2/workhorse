import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import todo_read from "../todo_read";
import { TODO_FILE, type TodoDoc } from "../_store";

const withTodos = (doc: TodoDoc) => ({ sandbox: { files: { [TODO_FILE]: JSON.stringify(doc) } } });

describe("todo_read", () => {
  it("renders pending, in-progress, and done with distinct markers", async () => {
    const { output } = await runTool(
      todo_read,
      {},
      withTodos({
        todos: [
          { id: "t1", title: "pending one", status: "pending", subtasks: [] },
          { id: "t2", title: "working on it", status: "in_progress", subtasks: [] },
          { id: "t3", title: "finished", status: "done", subtasks: [] },
        ],
      }),
    );

    expect(output).toContain("[ ] t1 pending one");
    expect(output).toContain("[~] t2 working on it");
    expect(output).toContain("[x] t3 finished");
  });

  it("indents subtasks under their todo with their own markers", async () => {
    const { output } = await runTool(
      todo_read,
      {},
      withTodos({
        todos: [
          {
            id: "t1",
            title: "parent",
            status: "in_progress",
            subtasks: [
              { id: "t1.1", title: "done sub", done: true },
              { id: "t1.2", title: "open sub", done: false },
            ],
          },
        ],
      }),
    );

    expect(output).toContain("    [x] t1.1 done sub");
    expect(output).toContain("    [ ] t1.2 open sub");
  });

  it("preserves list order", async () => {
    const { output } = await runTool(
      todo_read,
      {},
      withTodos({
        todos: [
          { id: "t1", title: "first", status: "pending", subtasks: [] },
          { id: "t2", title: "second", status: "pending", subtasks: [] },
        ],
      }),
    );

    expect(output.indexOf("first")).toBeLessThan(output.indexOf("second"));
  });

  it("reports an empty list when no todos exist", async () => {
    const { output } = await runTool(todo_read, {}, withTodos({ todos: [] }));
    expect(output).toBe("(no todos yet)");
  });

  it("reports an empty list when the file is absent", async () => {
    const { output } = await runTool(todo_read, {});
    expect(output).toBe("(no todos yet)");
  });

  it("degrades to an empty list on corrupt JSON instead of throwing", async () => {
    const { output } = await runTool(
      todo_read,
      {},
      { sandbox: { files: { [TODO_FILE]: "{ not json" } } },
    );
    expect(output).toBe("(no todos yet)");
  });

  it("degrades to an empty list when todos is not an array", async () => {
    const { output } = await runTool(
      todo_read,
      {},
      { sandbox: { files: { [TODO_FILE]: JSON.stringify({ todos: "nope" }) } } },
    );
    expect(output).toBe("(no todos yet)");
  });

  it("never writes — it is a read-only tool", async () => {
    const { sandbox } = await runTool(
      todo_read,
      {},
      withTodos({ todos: [{ id: "t1", title: "x", status: "pending", subtasks: [] }] }),
    );
    expect(sandbox.writes).toHaveLength(0);
  });
});
