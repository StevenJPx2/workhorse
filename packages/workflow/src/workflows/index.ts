// Static registry of hard-coded workflow defs. A new workflow is a def here
// + an eval case — never an uploaded spec. This is what keeps the package
// "light": no data interpretation, no KV registry, nothing loaded at runtime.

import type { WorkflowDef } from "../context";
import { coding } from "./coding";
import { codingRaw } from "./coding-raw";
import { screenshotPr } from "./screenshot-pr";

const DEFS: WorkflowDef[] = [coding, codingRaw, screenshotPr];

export const workflowDefs: Record<string, WorkflowDef> = Object.fromEntries(
  DEFS.map((d) => [d.name, d]),
);

export function workflowDef(name: string | undefined): WorkflowDef | undefined {
  return name ? workflowDefs[name] : undefined;
}

export { coding, codingRaw, screenshotPr };
