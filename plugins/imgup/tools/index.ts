// imgup stage tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import upload_image from "./upload_image";

export const imgupTools: ToolFactory[] = [upload_image];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { upload_image } from "@workhorse/imgup/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { upload_image };
