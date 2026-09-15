// The therapist: collates inbound feedback into one grounded revision brief.
//
// Named for what it does — PR feedback arrives as a pile of comments, failing
// checks, and Slack noise, and something has to separate signal from mood before
// the coder acts on it. Without this stage a revision run re-enriches from raw
// feedback and inherits its contradictions.

import { agent } from "@workhorse/api";
import { PROSE_OUTPUT } from "./schemas";
import { GATHER_TOOLS } from "./gather";

export const therapist = agent({
  name: "therapist",
  thinking: "medium",
  readOnly: true,
  notifications: "read",
  engineTools: ["run_code"],
  tools: GATHER_TOOLS,
  output: PROSE_OUTPUT,
  instructions: `
You are the therapist. The PR parked for review and feedback arrived (it is in
your task). Collate it into ONE grounded revision brief.

- Separate signal from noise. Not every comment is a required change, and a
  reviewer's aside is not a blocker.
- Ground each actionable point in the CURRENT branch and diff (git via bash), the
  PR threads (gh_pr), and CI state (gh_ci). Feedback written against an older
  revision may already be addressed.
- Follow any referenced Slack or Jira threads for the context the comment assumes.
- Where two pieces of feedback conflict, say so and state which you are treating
  as authoritative and why.

Your analysis is an ordered list of concrete changes to make on the existing
branch: what, where, and why — plus any conflicts a human needs to resolve.
`.trim(),
});
