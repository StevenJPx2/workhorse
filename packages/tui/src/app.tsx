import { type JSX, Match, Show, Switch, onMount } from "solid-js";
import type {
  ConfigPaths,
  HarnessOrchestrator,
  HookEmitter,
  Issue,
  MemoryService,
  MonitorService,
  Tracker,
  WorkhorseConfig,
} from "workhorse-core";

import { useGlobalBindings } from "./bindings";
import {
  DeleteConfirmModal,
  ModelSelectorModal,
  ShutdownOverlay,
  type SpawnAllConfig,
  SpawnAllModal,
  type SpawnConfig,
  SpawnModal,
  ToastContainer,
} from "./components";
import { WorkhorseProvider } from "./context/workhorse.tsx";
import { Agent, Help, Overview } from "./screens";
import { initActivityStore } from "./state/activity-store.ts";
import { logError } from "./state/error-log.ts";
import { ui } from "./state/ui";

interface AppProps {
  config: WorkhorseConfig;
  paths: ConfigPaths;
  hooks: HookEmitter;
  memory: MemoryService;
  monitors: MonitorService;
  tracker: Tracker;
  orchestrator: HarnessOrchestrator;
}

/** Inner component that uses context - must be rendered inside WorkhorseProvider */
function AppContent(props: AppProps & { children?: JSX.Element }) {
  // Initialize global keybindings (requires WorkhorseContext)
  useGlobalBindings();

  // Initialize global activity store with hooks (runs once)
  onMount(() => initActivityStore(props.hooks));

  const spawnSingleIssue = async (
    issue: Issue,
    harness: string,
    baseBranch: string,
  ) => {
    ui.startSpawning(issue);
    try {
      await props.orchestrator
        .spawn({
          issue,
          harness,
          baseBranch,
          repoPath: props.paths.worktreesRoot.replace(/-worktrees$/, ""),
          model: ui.selectedModel() || props.config.agent.model || undefined,
        })
        .then((r) => r.start());
      ui.stopSpawning(issue.externalId);
    } catch (err) {
      ui.stopSpawning(issue.externalId);
      ui.showError(
        `Spawn failed for ${issue.externalId}: ${logError(err, "spawnSingleIssue")}`,
      );
    }
  };

  const handleSpawn = async (config: SpawnConfig) => {
    ui.closeModal();
    await spawnSingleIssue(config.issue, config.harness, config.baseBranch);
  };

  // oxlint-disable-next-line workhorse/no-single-use-variable -- used in JSX
  const handleSpawnAll = (config: SpawnAllConfig) => {
    ui.closeModal();
    for (const issue of config.issues) {
      void spawnSingleIssue(issue, config.harness, config.baseBranch);
    }
  };

  // Get effective model: TUI selection > config
  const currentModel = () =>
    ui.selectedModel() || props.config.agent.model || "";

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Modal layer - rendered first but with higher zIndex to overlay */}
      <Show when={ui.modal() === "spawn" && ui.spawnIssue()}>
        {(issue: () => Issue) => (
          <SpawnModal
            issue={issue()}
            onSpawn={handleSpawn}
            onClose={ui.closeModal}
          />
        )}
      </Show>
      <Show when={ui.modal() === "spawn-all" && ui.spawnAllIssues().length > 0}>
        <SpawnAllModal
          issues={ui.spawnAllIssues()}
          onSpawn={handleSpawnAll}
          onClose={ui.closeModal}
        />
      </Show>
      <Show when={ui.modal() === "model"}>
        <ModelSelectorModal
          currentModel={currentModel()}
          onSelect={(modelId) => {
            ui.setSelectedModel(modelId);
            ui.closeModal();
          }}
          onClose={ui.closeModal}
        />
      </Show>
      <Show when={ui.modal() === "delete" && ui.deleteIssue()}>
        {(issue: () => Issue) => (
          <DeleteConfirmModal
            issue={issue()}
            onConfirm={async (issueToDelete) => {
              try {
                await props.tracker.deleteIssue(issueToDelete.id);
                ui.closeModal();
              } catch (err) {
                console.error("Failed to delete issue:", err);
              }
            }}
            onClose={ui.closeModal}
          />
        )}
      </Show>

      {/* Main content */}
      <Switch>
        <Match when={ui.screen() === "overview"}>
          <Overview />
        </Match>
        <Match when={ui.screen() === "agent"}>
          <Agent />
        </Match>
        <Match when={ui.screen() === "help"}>
          <Help />
        </Match>
      </Switch>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Shutdown overlay - shown during graceful shutdown */}
      <Show when={ui.shuttingDown()}>
        <ShutdownOverlay />
      </Show>
    </box>
  );
}

/**
 * Root application component.
 * Handles screen routing and modal display.
 * Uses @opentui/keymap for layered, focus-aware keybindings.
 */
export function App(props: AppProps) {
  return (
    <WorkhorseProvider
      value={{
        config: props.config,
        paths: props.paths,
        hooks: props.hooks,
        memory: props.memory,
        monitors: props.monitors,
        tracker: props.tracker,
        orchestrator: props.orchestrator,
      }}
    >
      <AppContent {...props} />
    </WorkhorseProvider>
  );
}
