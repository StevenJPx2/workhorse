import { bootstrap, resolveConfigPaths } from "workhorse-core";
import { githubPlugin } from "workhorse-plugin-github";
import { jiraPlugin } from "workhorse-plugin-jira";
import { piAdapterPlugin } from "workhorse-plugin-pi-adapter";
import { playwrightPlugin } from "workhorse-plugin-playwright";
import { createCliRenderer } from "@opentui/core";
import { render, useRenderer } from "@opentui/solid";
import { App } from "./app.tsx";
import { parseCliArgs, showHelp, showModels } from "./cli.ts";
import tuiPlugin from "./plugin.ts";
import { Auth, Setup } from "./screens";
import type { SetupPluginConfig, AuthScreenProps } from "./screens";
import {
  getPluginsNeedingAuth,
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

interface AuthWrapperProps {
  plugins: AuthScreenProps["plugins"];
  onComplete: () => void;
  onSkip?: () => void;
}

/**
 * Wrapper component for Auth that can access the renderer via useRenderer().
 */
function AuthWrapper(props: AuthWrapperProps) {
  const renderer = useRenderer();

  return (
    <Auth
      plugins={props.plugins}
      onComplete={() => {
        renderer.destroy();
        props.onComplete();
      }}
      onSkip={() => {
        renderer.destroy();
        props.onSkip?.();
      }}
    />
  );
}

/**
 * Start the Workhorse TUI.
 * Shows setup wizard if required config is missing, then authenticates plugins,
 * then bootstraps the system.
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
    const workhorse = await bootstrap({
      plugins: [piAdapterPlugin], // Only need adapter plugins to list models
    });
    showModels(workhorse.orchestrator);
    process.exit(0);
  }

  // Check if setup is needed before bootstrapping
  const paths = resolveConfigPaths();
  const existingConfig = loadExistingConfig(paths.globalConfig, paths.projectConfig);

  // Set theme early so setup/auth screens match the app theme
  setTheme(existingConfig.ui.theme);

  const pluginsNeedingSetup = getPluginsNeedingSetup(existingConfig);

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
    console.log("Setup skipped. Please configure plugins manually in ~/.workhorse.toml");
    process.exit(1);
  }

  // Check if any plugins need authentication before bootstrapping
  // Auth providers are self-contained (keychain, CLI checks) so this works pre-bootstrap
  const pluginsNeedingAuth = await getPluginsNeedingAuth([jiraPlugin, githubPlugin]);

  if (
    pluginsNeedingAuth.length > 0 &&
    !(await new Promise<boolean>((resolve) => {
      render(() => (
        <AuthWrapper
          plugins={pluginsNeedingAuth}
          onComplete={() => resolve(true)}
          onSkip={() => resolve(false)}
        />
      ));
    }))
  ) {
    console.log("Authentication skipped. Some features may be unavailable.");
    process.exit(1);
  }

  // Bootstrap Workhorse with all plugins
  const workhorse = await bootstrap({
    plugins: [
      tuiPlugin, // TUI plugin (renderer hooks)
      jiraPlugin, // Jira integration
      githubPlugin, // GitHub integration
      playwrightPlugin, // Browser automation
      piAdapterPlugin, // Default agent harness
    ],
    // Pass CLI model override (deep partial allows nested partial objects)
    overrides: args.model ? { agent: { model: args.model } } : undefined,
  });

  // Initialize theme from config
  setTheme(workhorse.config.ui.theme);

  // Render the TUI
  await render(
    () => (
      <App
        config={workhorse.config}
        paths={workhorse.paths}
        hooks={workhorse.hooks}
        memory={workhorse.memory}
        monitors={workhorse.monitors}
        tracker={workhorse.tracker}
        orchestrator={workhorse.orchestrator}
      />
    ),
    await createCliRenderer(),
  );

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await workhorse.shutdown();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.main) {
  startTUI();
}
