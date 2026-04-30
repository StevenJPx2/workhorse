import { render } from "@opentui/solid";
import { bootstrap } from "@jiratown/core";
import { App } from "./app.tsx";
import tuiPlugin from "./plugin.ts";

// Import plugins directly for bootstrap
// These will be dynamically imported once the plugin packages exist
// import jiraPlugin from "@jiratown/plugin-jira";
// import githubPlugin from "@jiratown/plugin-github";
// import piAdapterPlugin from "@jiratown/plugin-pi-adapter";

/**
 * Start the Jiratown TUI.
 * Bootstraps the core system with all plugins and renders the terminal UI.
 */
export async function startTUI() {
  // Bootstrap Jiratown with all plugins
  const jiratown = await bootstrap({
    plugins: [
      tuiPlugin, // TUI plugin (renderer hooks)
      // jiraPlugin,       // Jira integration (TODO: uncomment when available)
      // githubPlugin,     // GitHub integration (TODO: uncomment when available)
      // piAdapterPlugin,  // Default agent harness (TODO: uncomment when available)
    ],
  });

  // Render the TUI (after all plugins have registered renderers)
  render(() => (
    <App
      config={jiratown.config}
      hooks={jiratown.hooks}
      memory={jiratown.memory}
      tracker={jiratown.tracker}
      orchestrator={jiratown.orchestrator}
    />
  ));

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
