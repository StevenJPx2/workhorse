// github stage tools — read-only GitHub, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import gh_ci from "./gh_ci";
import gh_commits from "./gh_commits";
import gh_issue from "./gh_issue";
import gh_pr from "./gh_pr";
import gh_search_code from "./gh_search_code";

export const githubTools: ToolFactory[] = [gh_pr, gh_ci, gh_issue, gh_search_code, gh_commits];

// Named re-exports of the SAME bindings imported above, so an agent can
// `import { gh_ci } from "@workhorse/github/tools"` and a typo is a compile
// error rather than a silently empty allowlist. The array stays for the plugin
// contract (chat + stage assembly still read it).
export { gh_ci, gh_commits, gh_issue, gh_pr, gh_search_code };
