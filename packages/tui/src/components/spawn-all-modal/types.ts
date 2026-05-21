import type { Issue } from "workhorse-core";

export interface SpawnAllModalProps {
  issues: Issue[];
  onSpawn: (config: SpawnAllConfig) => void;
  onClose: () => void;
}

export interface SpawnAllConfig {
  issues: Issue[];
  harness: string;
  baseBranch: string;
}
