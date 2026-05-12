import type { Issue } from "@stevenjpx2/jiratown-core";

export interface SpawnModalProps {
  issue: Issue;
  onSpawn: (config: SpawnConfig) => void;
  onClose: () => void;
}

export interface SpawnConfig {
  issue: Issue;
  harness: string;
  baseBranch: string;
}
