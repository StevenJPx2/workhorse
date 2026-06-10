import z from "zod";

import { PresetConfig } from "./preset";
import { Settings } from "./settings";

/** Global/project config: cascade defaults plus repo-wide preset patches. */
export const MainConfig = z.object({
  defaults: Settings.optional(),
  presets: z.record(z.string(), PresetConfig).optional(),
});

export type MainConfigT = z.infer<typeof MainConfig>;
