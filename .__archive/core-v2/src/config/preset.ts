import z from "zod";

import { Settings } from "./settings";

/** A reusable step body — prompts, allowlists, and settings, minus its id. */
export const PresetConfig = Settings.extend({
  epilogue: z.string().optional(),
  prologue: z.string().optional(),
  services: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

export type PresetConfigT = z.infer<typeof PresetConfig>;
