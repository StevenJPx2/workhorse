// Registry: the todo plugin's stage tools.
import todo_read from "./todo_read";
import todo_update from "./todo_update";
import todo_write from "./todo_write";

export const todoTools = [todo_write, todo_read, todo_update];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { todo_read } from "@workhorse/todo/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { todo_read, todo_update, todo_write };
