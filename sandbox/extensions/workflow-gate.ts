// Pi extension: workflow write gate + artifact submission (engine half).
//
// Two mechanisms, both engine-configured via environment:
//
// 1. WRITE GATE — WORKHORSE_WRITE_ALLOW (comma-separated globs). When set,
//    write/edit tool calls whose target path doesn't match any pattern are
//    BLOCKED mechanically (tool_call event, not prompt-begging). readOnly
//    stages run with only their stage dir allowed; stages can widen the
//    gate via the spec's writeAllow globs. Unset = no gate (unrestricted
//    stages).
//
// 2. submit_work — the dedicated completion tool: writes analysis.md +
//    control.json into WORKHORSE_STAGE_DIR and nothing else. The narrow
//    action a stage always needs is its own tool, so a fully read-only
//    stage can fulfill the completion contract without any general write
//    capability.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const STAGE_DIR = process.env.WORKHORSE_STAGE_DIR ?? "";
const ALLOW = (process.env.WORKHORSE_WRITE_ALLOW ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Glob → regex: ** crosses directories, * stays within a segment. */
function globToRe(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${esc}$`);
}
const ALLOW_RES = ALLOW.map(globToRe);

function allowed(path: string): boolean {
  if (ALLOW_RES.length === 0) return true; // no gate configured
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  return ALLOW_RES.some((re) => re.test(abs));
}

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
  // --- the gate -------------------------------------------------------------
  pi.on("tool_call", async (event) => {
    if (ALLOW_RES.length === 0) return;
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const input = event.input as { path?: string; file_path?: string };
    const target = input.path ?? input.file_path;
    if (!target) return;
    if (!allowed(target)) {
      return {
        block: true,
        reason:
          `write gate: ${target} is outside this stage's allowed patterns ` +
          `(${ALLOW.join(", ")}). Use submit_work for your completion artifacts; ` +
          "repo changes are not permitted in this stage.",
      };
    }
  });

  // --- the dedicated completion tool -----------------------------------------
  if (STAGE_DIR) {
    pi.registerTool({
      name: "submit_work",
      label: "Submit stage work",
      description:
        "Submit this stage's completion artifacts: your analysis (markdown) and control " +
        "(a JSON object matching the stage's control contract). This writes analysis.md and " +
        "control.json into the stage directory — the ONLY sanctioned way to complete a stage. " +
        "Call it exactly once, as your final action.",
      parameters: Type.Object({
        analysis: Type.String({
          description: "Your findings/summary for the next stage and the human reviewer (markdown)",
        }),
        control: Type.Record(Type.String(), Type.Unknown(), {
          description: 'The control object, e.g. {"status": "done"} or the stage\'s declared schema',
        }),
      }),
      async execute(_id, params) {
        try {
          mkdirSync(STAGE_DIR, { recursive: true });
          writeFileSync(join(STAGE_DIR, "analysis.md"), params.analysis);
          writeFileSync(join(STAGE_DIR, "control.json"), JSON.stringify(params.control, null, 1));
          return textResult(
            `Artifacts written to ${STAGE_DIR} (analysis.md, control.json). Stage complete — stop here.`,
          );
        } catch (err) {
          return textResult(`submit_work failed: ${String(err).slice(0, 300)}`);
        }
      },
    });
  }

  // Silence unused warnings when the gate is off.
  void dirname;
}
