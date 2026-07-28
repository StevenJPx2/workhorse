// tickets tools — fetch_context (stage surface) + workhorse (chat surface).
//
// The five workhorse_* operator tools collapsed into one `workhorse` tool with
// an action picklist; the chat/stage surface boundary already gates it, so no
// capability split is needed. Both tools carry `help: true`.
import type { ToolFactory } from "@workhorse/api";
import fetch_context from "./fetch_context";
import workhorse from "./workhorse";

export const ticketsTools: ToolFactory[] = [fetch_context, workhorse];
