// The read-only knowledge-gathering surface, shared by the enricher and the
// therapist.
//
// Both answer "what is actually true here?" before anyone changes anything, so
// they need the same reach: the repo, prior fleet knowledge, the PR and its CI, and
// whatever external docs the task points at. Declaring it once means the two cannot
// drift into asymmetric capability for no reason.

import type { ToolFactory } from "@workhorse/api";
import { browser_open, browser_read } from "@workhorse/browser/tools";
import { bash, find, grep, ls, read } from "@workhorse/core/tools";
import { gh_ci, gh_issue, gh_pr, gh_search_code } from "@workhorse/github/tools";
import { memory_search, search_fleet_knowledge } from "@workhorse/knowledge/tools";
import { web_read, web_search } from "@workhorse/search/tools";
import { fetch_context } from "@workhorse/tickets/tools";

export const GATHER_TOOLS: ToolFactory[] = [
  // The repo itself.
  read,
  grep,
  find,
  ls,
  // bash is read-only BY STAGE, not by tool: these agents carry readOnly, which
  // is what stops it writing. It is here for `git log`, `git diff`, and running
  // the repo's own checks.
  bash,
  // Prior knowledge: this repo's own memories, and every other repo's runs.
  memory_search,
  search_fleet_knowledge,
  // The PR conversation and its CI.
  gh_pr,
  gh_ci,
  gh_issue,
  gh_search_code,
  // Anything the task links to. fetch_context resolves the ticket's own attached
  // refs (Jira issue, Slack thread, repo) on demand — without it an agent cannot
  // read the material the request was filed against.
  fetch_context,
  web_search,
  web_read,
  browser_open,
  browser_read,
];
