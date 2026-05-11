import { Match, Switch, Show, onMount } from "solid-js";
import type {
  JiratownConfig,
  ConfigPaths,
  HookEmitter,
  MemoryService,
  Tracker,
  HarnessOrchestrator,
  Issue,
} from "@jiratown/core";
import { JiratownProvider } from "./context/jiratown.tsx";
import { Overview, Agent, Help } from "./screens";
import {
  SpawnModal,
  type SpawnConfig,
  ModelSelectorModal,
  DeleteConfirmModal,
  ToastContainer,
} from "./components";
import { useGlobalBindings } from "./bindings";
import { initActivityStore } from "./state/activity-store.ts";
import { ui } from "./state/ui.ts";
import { logError } from "./state/error-log.ts";

interface AppProps {
  config: JiratownConfig;
  paths: ConfigPaths;
  hooks: HookEmitter;
  memory: MemoryService;
  tracker: Tracker;
  orchestrator: HarnessOrchestrator;
}

/**
 * Root application component.
 * Handles screen routing and modal display.
 * Uses @opentui/keymap for layered, focus-aware keybindings.
 */
export function App(props: AppProps) {
  useGlobalBindings();

  // Initialize global activity store with hooks (runs once)
  onMount(() => initActivityStore(props.hooks));

  const handleSpawn = async (config: SpawnConfig) => {
    // Close modal immediately so user isn't stuck waiting
    ui.closeModal();

    try {
      await props.orchestrator
        .spawn({
          issue: config.issue,
          harness: config.harness as any,
          baseBranch: config.baseBranch,
          repoPath: props.paths.worktreesRoot.replace(/-worktrees$/, ""),
          model: ui.selectedModel() || props.config.agent.model || undefined,
        })
        .then((agent) => {
          ui.enterAgentView(config.issue.externalId);
          return agent.start();
        });
    } catch (err) {
      ui.showError(`Spawn failed: ${logError(err, "handleSpawn")}`);
    }
  };

  // Get effective model: TUI selection > config
  const currentModel = () => ui.selectedModel() || props.config.agent.model || "";

  return (
    <JiratownProvider
      value={{
        config: props.config,
        paths: props.paths,
        hooks: props.hooks,
        memory: props.memory,
        tracker: props.tracker,
        orchestrator: props.orchestrator,
      }}
    >
      <box flexDirection="column" width="100%" height="100%">
        {/* Modal layer - rendered first but with higher zIndex to overlay */}
        <Show when={ui.modal() === "spawn" && ui.spawnIssue()}>
          {(issue: () => Issue) => (
            <SpawnModal issue={issue()} onSpawn={handleSpawn} onClose={ui.closeModal} />
          )}
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
                  // Type assertion needed due to TypeScript server cache issue
                  await (props.tracker as any).deleteIssue(issueToDelete.id);
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
      </box>
    </JiratownProvider>
  );
}
