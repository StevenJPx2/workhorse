import { bootstrap, resolveConfigPaths } from "@jiratown/core";
import { githubPlugin } from "@jiratown/plugin-github";
import { jiraPlugin } from "@jiratown/plugin-jira";
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";
import { createCliRenderer } from "@opentui/core";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render, useRenderer } from "@opentui/solid";
import { App } from "./app.tsx";
import { createAppKeymap } from "./keymap.ts";
import tuiPlugin from "./plugin.ts";
import { Setup } from "./screens";
import type { SetupPluginConfig } from "./screens";
import {
  getPluginsNeedingSetup,
  loadExistingConfig,
  savePluginConfig,
  setupValuesToConfig,
} from "./setup";
import { setTheme } from "./theme.ts";

interface SetupWrapperProps {
  plugins: SetupPluginConfig[];
  configPath: string;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Wrapper component for Setup that can access the renderer via useRenderer().
 */
function SetupWrapper(props: SetupWrapperProps) {
  const renderer = useRenderer();

  const handleComplete = (configs: Record<string, Record<string, string>>) => {
    const newConfig = setupValuesToConfig(configs);
    savePluginConfig(props.configPath, newConfig);
    renderer.destroy();
    props.onComplete();
  };

  const handleSkip = () => {
    renderer.destroy();
    props.onSkip();
  };

  return <Setup plugins={props.plugins} onComplete={handleComplete} onSkip={handleSkip} />;
}

/**
 * Run the setup wizard if required plugin configs are missing.
 * Returns true if setup was completed, false if user skipped.
 */
async function runSetupIfNeeded(): Promise<boolean> {
  const paths = resolveConfigPaths();
  const existingConfig = loadExistingConfig(paths.globalConfig, paths.projectConfig);
  const pluginsNeedingSetup = getPluginsNeedingSetup(existingConfig);

  if (pluginsNeedingSetup.length === 0) {
    return true; // No setup needed
  }

  return new Promise((resolve) => {
    render(() => (
      <SetupWrapper
        plugins={pluginsNeedingSetup}
        configPath={paths.globalConfig}
        onComplete={() => resolve(true)}
        onSkip={() => resolve(false)}
      />
    ));
  });
}

/**
 * Start the Jiratown TUI.
 * Shows setup wizard if required config is missing, then bootstraps the system.
 */
export async function startTUI() {
  // Check if setup is needed before bootstrapping
  const setupComplete = await runSetupIfNeeded();
  if (!setupComplete) {
    console.log("Setup skipped. Please configure plugins manually in ~/.jiratown.toml");
    process.exit(1);
  }

  // Bootstrap Jiratown with all plugins
  const jiratown = await bootstrap({
    plugins: [
      tuiPlugin, // TUI plugin (renderer hooks)
      jiraPlugin, // Jira integration
      githubPlugin, // GitHub integration
      piAdapterPlugin, // Default agent harness
    ],
  });

  // Initialize theme from config
  setTheme(jiratown.config.ui.theme);

  // Create renderer and keymap
  const renderer = await createCliRenderer();
  const keymap = createAppKeymap(renderer);

  // Render the TUI with keymap provider
  await render(
    () => (
      <KeymapProvider keymap={keymap}>
        <App
          config={jiratown.config}
          paths={jiratown.paths}
          hooks={jiratown.hooks}
          memory={jiratown.memory}
          tracker={jiratown.tracker}
          orchestrator={jiratown.orchestrator}
        />
      </KeymapProvider>
    ),
    renderer,
  );

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await jiratown.shutdown();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.main) {
  startTUI();
}
