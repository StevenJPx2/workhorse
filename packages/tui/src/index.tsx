import { bootstrap, resolveConfigPaths } from "@jiratown/core";
import { githubPlugin } from "@jiratown/plugin-github";
import { jiraPlugin } from "@jiratown/plugin-jira";
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";
import { createCliRenderer } from "@opentui/core";
import { render, useRenderer } from "@opentui/solid";
import { App } from "./app.tsx";
import { parseCliArgs, showHelp, showModels } from "./cli.ts";
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
import { installErrorHandler, getLogPath, logInfo } from "./state/error-log.ts";

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

  return (
    <Setup
      plugins={props.plugins}
      onComplete={(configs) => {
        savePluginConfig(props.configPath, setupValuesToConfig(configs));
        renderer.destroy();
        props.onComplete();
      }}
      onSkip={() => {
        renderer.destroy();
        props.onSkip();
      }}
    />
  );
}

/**
 * Start the Jiratown TUI.
 * Shows setup wizard if required config is missing, then bootstraps the system.
 */
export async function startTUI() {
  // Install error logging early
  installErrorHandler();
  logInfo(`TUI starting, log file: ${getLogPath()}`);

  // Parse CLI arguments
  const args = parseCliArgs();

  // Handle --help
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Handle --list-models (needs bootstrap to register adapters first)
  if (args.listModels) {
    const jiratown = await bootstrap({
      plugins: [piAdapterPlugin], // Only need adapter plugins to list models
    });
    showModels(jiratown.orchestrator);
    process.exit(0);
  }

  // Check if setup is needed before bootstrapping
  const paths = resolveConfigPaths();
  const pluginsNeedingSetup = getPluginsNeedingSetup(
    loadExistingConfig(paths.globalConfig, paths.projectConfig),
  );

  if (
    pluginsNeedingSetup.length > 0 &&
    !(await new Promise<boolean>((resolve) => {
      render(() => (
        <SetupWrapper
          plugins={pluginsNeedingSetup}
          configPath={paths.globalConfig}
          onComplete={() => resolve(true)}
          onSkip={() => resolve(false)}
        />
      ));
    }))
  ) {
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
    // Pass CLI model override (deep partial allows nested partial objects)
    overrides: args.model ? { agent: { model: args.model } } : undefined,
  });

  // Initialize theme from config
  setTheme(jiratown.config.ui.theme);

  // Render the TUI
  await render(
    () => (
      <App
        config={jiratown.config}
        paths={jiratown.paths}
        hooks={jiratown.hooks}
        memory={jiratown.memory}
        monitors={jiratown.monitors}
        tracker={jiratown.tracker}
        orchestrator={jiratown.orchestrator}
      />
    ),
    await createCliRenderer(),
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
