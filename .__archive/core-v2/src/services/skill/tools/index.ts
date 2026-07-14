import type { SkillService } from "../service";

import { loadSkillTool } from "./load";

export function skillTools(service: SkillService) {
  return [loadSkillTool(service.list.bind(service))];
}
