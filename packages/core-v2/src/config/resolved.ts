import z from "zod";

import { MainConfig } from "./main";
import { PresetConfig } from "./preset";
import { WorkflowConfig } from "./workflow";

/**
 * The whole `.workhorse` tree assembled into one object, mirroring the
 * directory layout:
 *
 * ```
 * config.toml            → config
 * workflows/<name>.toml  → workflows[name]
 * presets/<name>.toml    → presets[name]
 * ```
 *
 * Built by globbing the config roots and merging — the project `.workhorse`
 * over the personal `~/.config/workhorse`.
 */
export const ResolvedConfig = z.object({
  config: MainConfig.optional(),
  presets: z.record(z.string(), PresetConfig).default({}),
  workflows: z.record(z.string(), WorkflowConfig).default({}),
});

export type ResolvedConfigT = z.infer<typeof ResolvedConfig>;
