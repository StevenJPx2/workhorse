// Plugin registry. Workers can't load code at runtime, so plugins register
// here at build time — the decoupling is the SourcePlugin interface: core
// routes webhooks and stores events without knowing source specifics.

import { githubPlugin } from "./github/worker";
import type { SourcePlugin } from "./types";

export const plugins: SourcePlugin[] = [githubPlugin];

export function pluginFor(id: string): SourcePlugin | undefined {
  return plugins.find((p) => p.id === id);
}

export type { ExternalEvent, SourcePlugin } from "./types";
