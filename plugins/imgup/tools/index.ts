// imgup stage tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import upload_image from "./upload_image";

export const imgupTools: ToolFactory[] = [upload_image];
