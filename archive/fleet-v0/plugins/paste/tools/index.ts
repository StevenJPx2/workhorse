// paste stage tools — one ToolFactory per file, collected here.
import type { ToolFactory } from "@workhorse/api";
import upload_text from "./upload_text";

export const pasteTools: ToolFactory[] = [upload_text];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { upload_text } from "@workhorse/paste/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { upload_text };
