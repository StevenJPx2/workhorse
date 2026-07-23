// paste stage tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import upload_text from "./upload_text";

export const pasteTools: ToolFactory[] = [upload_text];
