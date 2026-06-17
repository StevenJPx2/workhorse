import type { NodePlopAPI } from "plop";

import { registerHelpers } from "./generators/helpers";
import { registerServiceGenerator } from "./generators/service/generator";
import { registerSkillGenerator } from "./generators/skill/generator";
import { registerToolGenerator } from "./generators/tool/generator";

/**
 * Plop generators for core-v2.
 *
 * Run interactively:   aube run generate
 *
 * Run non-interactive (CI / scripts):
 *   aube run generate service --name git
 *   aube run generate tool --service git --name read-config
 *   aube run generate skill --name code-review
 */
export default function plopfile(plop: NodePlopAPI): void {
  registerHelpers(plop);
  registerServiceGenerator(plop);
  registerToolGenerator(plop);
  registerSkillGenerator(plop);
}
