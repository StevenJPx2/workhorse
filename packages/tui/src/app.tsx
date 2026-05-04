import { Match, Switch, Show } from "solid-js";
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
import { SpawnModal, type SpawnConfig } from "./components/spawn-modal.tsx";
import { useGlobalBindings } from "./bindings";
import { ui } from "./state/ui.ts";

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

  const handleSpawn = async (config: SpawnConfig) => {
    await props.orchestrator.spawn({
      issue: config.issue,
      harness: config.harness as any,
      baseBranch: config.baseBranch,
      repoPath: props.paths.worktreesRoot.replace(/-worktrees$/, ""),
    });
    ui.closeModal();
    ui.enterAgentView(config.issue.externalId);
  };

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

        <Show when={ui.modal() === "spawn" && ui.spawnIssue()}>
          {(issue: () => Issue) => (
            <SpawnModal issue={issue()} onSpawn={handleSpawn} onClose={ui.closeModal} />
          )}
        </Show>
      </box>
    </JiratownProvider>
  );
}
