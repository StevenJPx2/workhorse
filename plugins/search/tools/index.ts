// search stage tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import web_read from "./web_read";
import web_search from "./web_search";

export const searchTools: ToolFactory[] = [web_search, web_read];
