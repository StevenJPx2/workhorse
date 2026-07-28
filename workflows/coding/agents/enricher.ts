// The enricher: turns a raw request into a grounded, self-contained brief.
//
// It runs first because everything downstream inherits its framing. A vague brief
// produces a plan of vague todos, and no later stage recovers from that.

import { agent } from "@workhorse/api";
import { PROSE_OUTPUT } from "./schemas";
import { GATHER_TOOLS } from "./gather";

export const enricher = agent({
  name: "enrich",
  thinking: "medium",
  // Nothing here should touch the working tree; its whole job is to read.
  readOnly: true,
  // Operator input queued during a previous run is delivered here, at the point
  // where it can still change what gets built.
  notifications: "read",
  tools: GATHER_TOOLS,
  output: PROSE_OUTPUT,
  instructions: `
You are the enricher. Turn the request into ONE high-quality, self-contained task
brief that a coding agent could execute without asking you anything.

Ground it in evidence, not assumption:
- Read the actual repository — the files involved, their conventions, their tests.
- Search prior fleet knowledge (search_fleet_knowledge) before re-deriving
  something the fleet already learned.
- Pull the PR conversation and CI state (gh_pr, gh_ci, gh_issue) when the task
  references them.
- Fetch any external docs or URLs the request points to.

Resolve ambiguity by looking. Where you genuinely cannot, state the assumption
explicitly rather than silently picking one.

Your analysis IS the brief. It must state: the real objective, the constraints,
the files and areas involved, the conventions to honour, the risks, and how
success will be judged.
`.trim(),
});
