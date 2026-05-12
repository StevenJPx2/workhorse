/**
 * CLI argument parsing and handlers for Jiratown TUI.
 *
 * @module cli
 */

import { parseArgs } from "node:util";
import type { HarnessOrchestrator, ModelInfo } from "@stevenjpx2/jiratown-core";

/** CLI argument definitions. */
const CLI_OPTIONS = {
  model: {
    type: "string" as const,
    short: "m",
    description: "Model to use (e.g., claude-sonnet-4, claude-opus-4-6)",
  },
  "list-models": {
    type: "boolean" as const,
    short: "l",
    description: "List available models and exit",
  },
  help: {
    type: "boolean" as const,
    short: "h",
    description: "Show help message",
  },
};

/** Parsed CLI arguments. */
export interface CliArgs {
  model?: string;
  listModels?: boolean;
  help?: boolean;
}

/** Parse CLI arguments. */
export function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      options: CLI_OPTIONS,
      allowPositionals: true,
    });
    return {
      model: values.model as string | undefined,
      listModels: values["list-models"] as boolean | undefined,
      help: values.help as boolean | undefined,
    };
  } catch {
    return {};
  }
}

/** Show help message. */
export function showHelp(): void {
  console.log(`
Jiratown TUI - AI-powered Jira issue resolver

Usage: jiratown [options]

Options:
  -m, --model <model>   Model to use (e.g., claude-sonnet-4, claude-opus-4-6)
  -l, --list-models     List available models and exit
  -h, --help            Show this help message

Environment Variables:
  OPENCODE_API_KEY      API key for OpenCode provider (recommended)
  ANTHROPIC_API_KEY     API key for Anthropic provider

Config File:
  ~/.jiratown.toml      Global configuration
  .jiratown.toml        Project-specific configuration

Example:
  jiratown --model claude-sonnet-4
  OPENCODE_API_KEY=xxx jiratown
`);
}

/** Extended model info that includes which adapter/harness it comes from. */
export type ExtendedModelInfo = ModelInfo & { harness: string };

/**
 * Show available models from the orchestrator.
 * Lists all models from all registered adapters, grouped by harness and provider.
 * @param orchestrator - The harness orchestrator with registered adapters
 */
export function showModels(orchestrator: HarnessOrchestrator): void {
  console.log("\nAvailable Models:\n");

  // Get all models from all registered adapters
  const models: ExtendedModelInfo[] = orchestrator.getAllModels();

  if (models.length === 0) {
    console.log("No models available. Make sure adapter plugins are registered.");
    return;
  }

  // Group by harness, then by provider
  const byHarness = new Map<string, Map<string, ExtendedModelInfo[]>>();
  for (const model of models) {
    if (!byHarness.has(model.harness)) {
      byHarness.set(model.harness, new Map());
    }
    const providerMap = byHarness.get(model.harness)!;
    const existing = providerMap.get(model.provider) ?? [];
    existing.push(model);
    providerMap.set(model.provider, existing);
  }

  for (const [harness, providerMap] of byHarness) {
    const adapterInfo = orchestrator.getAdapterInfoList().find((a) => a.harness === harness);
    const displayName = adapterInfo ? `${adapterInfo.icon} ${adapterInfo.displayName}` : harness;
    console.log(`${displayName}:`);

    for (const [provider, providerModels] of providerMap) {
      console.log(`  ${provider}:`);
      for (const m of providerModels) {
        const defaultTag = m.isDefault ? " (default)" : "";
        console.log(`    ${m.id.padEnd(30)} ${m.name}${defaultTag}`);
        if (m.description) {
          console.log(`      ${m.description}`);
        }
      }
    }
    console.log();
  }
}
