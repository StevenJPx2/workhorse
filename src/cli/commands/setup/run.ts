/**
 * Setup command runner
 */

import * as p from "@clack/prompts";
import {
  configExists,
  saveGlobalConfig,
  getConfigPaths,
  ensureConfigDir,
} from "#core/config/index.ts";
import { initDatabase } from "#core/db/index.ts";
import type { AgentType, JiratownConfig } from "#types/config.ts";
import { checkAllDependencies } from "./dependencies.ts";
import { authenticateAtlassian } from "./atlassian-auth.ts";

/**
 * Run the setup flow
 */
export async function runSetup(): Promise<void> {
  p.intro("Jiratown Setup");

  // Check if already configured
  if (configExists()) {
    const shouldReconfigure = await p.confirm({
      message: "Jiratown is already configured. Do you want to reconfigure?",
      initialValue: false,
    });

    if (p.isCancel(shouldReconfigure) || !shouldReconfigure) {
      p.outro("Setup cancelled.");
      return;
    }
  }

  // Check dependencies
  p.log.step("Checking dependencies...");

  const { available, missing } = await checkAllDependencies();

  for (const dep of available) {
    p.log.success(`${dep.name}`);
  }

  for (const dep of missing) {
    p.log.error(`${dep.name} not found`);
  }

  if (missing.length > 0) {
    p.log.warn("\nMissing dependencies:");
    for (const dep of missing) {
      p.log.message(`  - ${dep.name}${dep.installHint ? `: ${dep.installHint}` : ""}`);
    }

    const shouldContinue = await p.confirm({
      message: "Continue setup anyway? (Some features may not work)",
      initialValue: false,
    });

    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.outro("Setup cancelled. Please install missing dependencies and try again.");
      return;
    }
  }

  // Collect configuration
  const jiraCloudId = await p.text({
    message: "Jira cloud ID (e.g., yourcompany.atlassian.net):",
    placeholder: "yourcompany.atlassian.net",
    validate: (value) => {
      if (!value) {
        return "Jira cloud ID is required";
      }
      if (!value.includes(".atlassian.net") && !value.includes(".jira.com")) {
        return "Should be a valid Atlassian domain (e.g., yourcompany.atlassian.net)";
      }
    },
  });

  if (p.isCancel(jiraCloudId)) {
    p.outro("Setup cancelled.");
    return;
  }

  const defaultAgent = await p.select({
    message: "Default AI agent:",
    options: [
      {
        value: "opencode",
        label: "OpenCode",
        hint: "recommended",
      },
      {
        value: "claude",
        label: "Claude Code",
      },
    ],
    initialValue: "opencode",
  });

  if (p.isCancel(defaultAgent)) {
    p.outro("Setup cancelled.");
    return;
  }

  // Save configuration
  const config: JiratownConfig = {
    jira: {
      cloud_id: jiraCloudId,
    },
    defaults: {
      agent: defaultAgent as AgentType,
    },
  };

  const spinner = p.spinner();
  spinner.start("Saving configuration...");

  try {
    ensureConfigDir();
    saveGlobalConfig(config);

    const paths = getConfigPaths();
    spinner.message("Initializing database...");

    initDatabase();

    spinner.stop("Configuration saved!");

    p.log.success(`Config: ${paths.globalConfig}`);
    p.log.success(`Database: ${paths.database}`);
  } catch (error) {
    spinner.stop("Failed to save configuration");
    p.log.error(String(error));
    p.outro("Setup failed.");
    return;
  }

  // Authenticate with Atlassian MCP
  const shouldAuth = await p.confirm({
    message: "Connect to Jira now? (Opens browser for OAuth)",
    initialValue: true,
  });

  if (!p.isCancel(shouldAuth) && shouldAuth) {
    p.log.step("Opening browser for Atlassian authentication...");
    p.log.message("Complete the OAuth flow in your browser.");

    const authSpinner = p.spinner();
    authSpinner.start("Waiting for authentication...");

    const authResult = await authenticateAtlassian();

    if (authResult.success) {
      authSpinner.stop("Jira authentication successful!");
    } else {
      authSpinner.stop("Authentication skipped or failed");
      if (authResult.error) {
        p.log.warn(authResult.error);
      }
      p.log.message("You can authenticate later by running 'jiratown setup' again.");
    }
  }

  p.outro("Setup complete! Run 'jiratown' in any git repo to start.");
}
