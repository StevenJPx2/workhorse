// ─── Preloader (runs before any heavy imports) ──────────────────────────────
import { startPreloader, stopPreloader, updatePreloader } from "./preloader.ts";
startPreloader();

// ─── Heavy Imports ───────────────────────────────────────────────────────────
import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { createSignal, type Accessor, Match, Switch } from "solid-js";
import { bootstrap, resolveConfigPaths, type Workhorse } from "workhorse-core";

import { App } from "./app.tsx";
import { parseCliArgs, showHelp, showModels } from "./cli.ts";
import { LoadingScreen } from "./components";
import {
  getPluginsNeedingAuth,
  getPluginsNeedingSetup,
  loadExistingConfig,
} from "./setup";
import {
  loadAuthPlugins,
  loadPlugins,
  runAuthIfNeeded,
  runSetupIfNeeded,
} from "./startup.tsx";
import { installErrorHandler, getLogPath, logInfo } from "./state/error-log.ts";
import { ui } from "./state/ui";
import { setTheme } from "./theme.ts";

// ─── Main Entry Point ────────────────────────────────────────────────────────

/** Start the Workhorse TUI. Shows setup wizard if needed, authenticates plugins, then bootstraps. */
export async function startTUI() {
  installErrorHandler();
  logInfo(`TUI starting, log file: ${getLogPath()}`);

  // Parse CLI arguments
  const args = parseCliArgs();

  // Handle --help
  if (args.help) {
    stopPreloader();
    showHelp();
    process.exit(0);
  }

  // Handle --list-models (needs bootstrap to register adapters first)
  if (args.listModels) {
    updatePreloader("Loading model registry...");
    const { piAdapterPlugin } = await import("workhorse-plugin-pi-adapter");
    showModels(
      await bootstrap({
        plugins: [piAdapterPlugin], // Only need adapter plugins to list models
      }).then((r) => r.orchestrator),
    );
    stopPreloader();
    process.exit(0);
  }

  // Check if setup is needed before bootstrapping
  const paths = resolveConfigPaths();
  const existingConfig = loadExistingConfig(
    paths.globalConfig,
    paths.projectConfig,
  );

  // Set theme early so loading/setup/auth screens match the app theme
  setTheme(existingConfig.ui.theme);

  const pluginsNeedingSetup = getPluginsNeedingSetup(existingConfig);

  if (pluginsNeedingSetup.length > 0) {
    stopPreloader(); // Stop preloader before showing setup UI
    if (!(await runSetupIfNeeded(pluginsNeedingSetup, paths.globalConfig))) {
      console.log(
        "Setup skipped. Please configure plugins manually in ~/.workhorse.toml",
      );
      process.exit(1);
    }
    startPreloader(); // Restart preloader after setup
  }

  // Check if any plugins need authentication before bootstrapping
  // Auth providers are self-contained (keychain, CLI checks) so this works pre-bootstrap
  updatePreloader("Checking authentication...");
  const pluginsNeedingAuth = await getPluginsNeedingAuth(
    await loadAuthPlugins(),
  );

  if (pluginsNeedingAuth.length > 0) {
    stopPreloader(); // Stop preloader before showing auth UI
    if (!(await runAuthIfNeeded(pluginsNeedingAuth))) {
      console.log("Authentication skipped. Some features may be unavailable.");
      process.exit(1);
    }
    startPreloader(); // Restart preloader after auth
  }

  // Stop preloader - we're about to show the full TUI loading screen
  stopPreloader();

  // Reactive state for loading screen and workhorse instance
  const [stage, setStage] = createSignal("Initializing...");
  const [workhorse, setWorkhorse] = createSignal<Workhorse | null>(null);

  // Create renderer and start rendering immediately (shows loading screen)
  render(
    () => (
      <Switch fallback={<LoadingScreen stage={stage} />}>
        <Match when={workhorse()}>
          {(wh: Accessor<Workhorse>) => (
            <App
              config={wh().config}
              paths={wh().paths}
              hooks={wh().hooks}
              memory={wh().memory}
              monitors={wh().monitors}
              tracker={wh().tracker}
              orchestrator={wh().orchestrator}
            />
          )}
        </Match>
      </Switch>
    ),
    await createCliRenderer(),
  );

  // Load plugins in parallel with showing loading screen
  setStage("Loading plugins...");

  // Bootstrap in the background while showing loading screen
  const wh = await bootstrap({
    plugins: await loadPlugins(),
    overrides: args.model ? { agent: { model: args.model } } : undefined,
    onProgress: setStage, // Update loading screen with progress
  });

  // Initialize theme from config
  setTheme(wh.config.ui.theme);

  // Set shutdown callback so UI can trigger graceful shutdown
  ui.setShutdownCallback(() => wh.shutdown());

  // Signal that bootstrap is complete - this triggers the Switch to render App
  setWorkhorse(wh);

  // Cleanup on exit (Ctrl+C)
  process.on("SIGINT", async () => {
    await wh.shutdown();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.main) {
  startTUI();
}
