// todo stage tools — two tools, split on the read/write capability line.
//
// `todo` reads the plan; `todo_write` creates and updates it. The allowlist
// gates by tool NAME, so it cannot express "todo but read-only" — hence the
// split: a reviewer sees the plan without being able to mark work done.
import type { ToolFactory } from "@workhorse/api";
import todo from "./todo";
import todo_write from "./todo_write";

export const todoTools: ToolFactory[] = [todo, todo_write];
