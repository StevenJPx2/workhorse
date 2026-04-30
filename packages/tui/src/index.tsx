import { bootstrap } from "@jiratown/core";
import { githubPlugin } from "@jiratown/plugin-github";
import { jiraPlugin } from "@jiratown/plugin-jira";
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";
import { render } from "@opentui/solid";
import { App } from "./app.tsx";
import tuiPlugin from "./plugin.ts";

/**
 * Start the Jiratown TUI.
 * Bootstraps the core system with all plugins and renders the terminal UI.
 */
export async function startTUI() {
  // Bootstrap Jiratown with all plugins
  const jiratown = await bootstrap({
    plugins: [
      tuiPlugin, // TUI plugin (renderer hooks)
      jiraPlugin, // Jira integration
      githubPlugin, // GitHub integration
      piAdapterPlugin, // Default agent harness
    ],
  });

  // Render the TUI (after all plugins have registered renderers)
  render(() => (
    <App
      config={jiratown.config}
      paths={jiratown.paths}
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
