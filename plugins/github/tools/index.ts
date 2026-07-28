// github stage tools — ONE tool for the whole read surface.
//
// No capability split needed: the /github proxy allowlists GET, so every action
// is read-only by construction. `help: true` documents each action.
import type { ToolFactory } from "@workhorse/api";
import gh from "./gh";

export const githubTools: ToolFactory[] = [gh];
