/**
 * Dashboard command runner
 */

import { render } from "@opentui/solid";
import * as p from "@clack/prompts";
import { configExists } from "../../lib/config/index.ts";
import { App } from "../../app/app.tsx";

export interface DashboardOptions {
  /** Show all tickets across all repositories */
  all?: boolean;
}

/**
 * Run the dashboard TUI
 */
export async function runDashboard(options: DashboardOptions): Promise<void> {
  // Check if setup has been run
  if (!configExists()) {
    p.log.error("Jiratown is not configured.");
    p.log.message("Run 'jiratown setup' first to configure.");
    process.exit(1);
  }

  // Render the TUI
  render(() => <App showAll={options.all} />);
}
