// github stage tools — read-only GitHub, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import gh_ci from "./gh_ci";
import gh_commits from "./gh_commits";
import gh_issue from "./gh_issue";
import gh_pr from "./gh_pr";
import gh_search_code from "./gh_search_code";

export const githubTools: ToolFactory[] = [gh_pr, gh_ci, gh_issue, gh_search_code, gh_commits];
