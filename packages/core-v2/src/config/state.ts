import z from "zod";

import { Status } from "../schema/status";

/** A routing rule: when its expression holds, switch to stage `to`. */
export const ExitRule = z.object({
  to: Status,
  when: z.string(),
});

export type ExitRuleT = z.infer<typeof ExitRule>;

/** A stage: runs its steps in order, looping, until an exit fires. */
export const StateConfig = z.object({
  exits: z.array(ExitRule).optional(),
  name: Status,
  steps: z.array(z.string()),
});

export type StateConfigT = z.infer<typeof StateConfig>;
