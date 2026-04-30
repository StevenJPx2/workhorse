import { Match, Switch, Show } from "solid-js";
import { useRenderer, useKeyboard } from "@opentui/solid";
import type {
  JiratownConfig,
  HookEmitter,
  MemoryService,
  Tracker,
  HarnessOrchestrator,
} from "@jiratown/core";
import { JiratownProvider } from "./context/jiratown.tsx";
import { Overview, Agent, Help } from "./screens";
import { SpawnModal, type SpawnConfig } from "./components/spawn-modal.tsx";
import { ui } from "./state/ui.ts";

interface AppProps {
  config: JiratownConfig;
  hooks: HookEmitter;
  memory: MemoryService;
  tracker: Tracker;
  orchestrator: HarnessOrchestrator;
}

/**
 * Root application component.
 * Handles screen routing and modal display.
 */
export function App(props: AppProps) {
  const renderer = useRenderer();

  // Global keyboard handler
  useKeyboard((key) => {
    // If a modal is open, only handle escape to close it
    if (ui.modal()) {
      if (key.name === "escape") {
        ui.closeModal();
      }
      return;
    }

    // Global shortcuts
    if (key.name === "q") {
      renderer.destroy();
      return;
    }

    if (key.raw === "?" || key.name === "h") {
      ui.setScreen("help");
      return;
    }

    // Screen-specific shortcuts
    const screen = ui.screen();

    if (screen === "help") {
      if (key.name === "escape") {
        ui.backToOverview();
      }
      return;
    }

    if (screen === "agent") {
      if (key.name === "escape") {
        ui.backToOverview();
      }
      return;
    }
  });

  const handleSpawn = async (config: SpawnConfig) => {
    await props.orchestrator.spawn({
      issueId: config.issueId,
      harness: config.harness,
      baseBranch: config.baseBranch,
    });
    ui.closeModal();
    ui.enterAgentView(config.issueId);
  };

  return (
    <JiratownProvider
      value={{
        config: props.config,
        hooks: props.hooks,
        memory: props.memory,
        tracker: props.tracker,
        orchestrator: props.orchestrator,
      }}
    >
      <box flexDirection="column" width="100%" height="100%">
        {/* Screen router */}
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

        {/* Modal overlay */}
        <Show when={ui.modal() === "spawn" && ui.spawnIssue()}>
          {(issue) => <SpawnModal issue={issue()} onSpawn={handleSpawn} onClose={ui.closeModal} />}
        </Show>
      </box>
    </JiratownProvider>
  );
}
