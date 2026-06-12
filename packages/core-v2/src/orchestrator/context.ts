import type { Hookable } from "hookable";

import type { ResolvedConfigT } from "../config";
import type { Hooks } from "../hooks";

export interface GlobalContext {
  config: ResolvedConfigT;
  hooks: Hookable<Hooks>;
}
