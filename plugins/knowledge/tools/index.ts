// knowledge stage/chat tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import search_fleet_knowledge from "./search_fleet_knowledge";

export const knowledgeTools: ToolFactory[] = [search_fleet_knowledge];
