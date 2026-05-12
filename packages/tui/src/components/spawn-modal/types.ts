import type { Issue } from "workhorse-core";

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
