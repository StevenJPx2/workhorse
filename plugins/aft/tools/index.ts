// aft stage tools — READ-ONLY code intelligence.
//
// There is deliberately no aft_edit. Three reasons, each sufficient:
//   1. AFT's protocol has no symbol-level `edit` command at all (its `write` is
//      whole-file only), so there was nothing to call.
//   2. It was never in any workflow's tool allowlist, so it was unreachable.
//   3. It would BYPASS the write gate. The builtin `edit`/`write` tools route
//      through writeAllowed() in flue-session.ts, which enforces the stage's
//      writeAllow globs; an aft-side write happens inside the container and the
//      worker never sees the path. Wiring it would have handed a read-only
//      stage an ungated write path.
//
// Editing belongs to the builtin `edit`/`write` tools, which are gated.
import type { ToolFactory } from "@workhorse/api";
import aft_inspect from "./aft_inspect";
import aft_outline from "./aft_outline";
import aft_search from "./aft_search";
import aft_zoom from "./aft_zoom";

export const aftTools: ToolFactory[] = [aft_outline, aft_zoom, aft_search, aft_inspect];
