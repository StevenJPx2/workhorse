/**
 * Pi Coding Agent Model Registry implementation.
 *
 * Wraps the Pi SDK's ModelRegistry to provide a consistent interface
 * for the jiratown orchestrator.
 *
 * @module @stevenjpx2/jiratown-plugin-pi-adapter/registry
 */

import { type ModelInfo, ModelRegistry } from "@stevenjpx2/jiratown-core";
import { AuthStorage, ModelRegistry as PiModelRegistry } from "@earendil-works/pi-coding-agent";

type Model = ReturnType<PiModelRegistry["getAll"]>[number];

// Cached instance
let cachedPiRegistry: PiModelRegistry | null = null;

function getPiRegistry(): PiModelRegistry {
  if (!cachedPiRegistry) {
    cachedPiRegistry = PiModelRegistry.create(AuthStorage.create());
  }
  return cachedPiRegistry;
}

/**
 * Convert SDK model to our ModelInfo type.
 */
function toModelInfo(model: Model, isDefault: boolean): ModelInfo {
  return {
    provider: model.provider,
    id: model.id,
    name: model.name,
    description: (model as any).description ?? "",
    contextWindow: model.contextWindow,
    reasoning: model.reasoning,
    isDefault,
  };
}

/**
 * Model registry implementation for the Pi Coding Agent.
 * Wraps the Pi SDK's ModelRegistry to provide jiratown-compatible model access.
 */
export class PiAdapterModelRegistry extends ModelRegistry {
  private static instance: PiAdapterModelRegistry | null = null;

  /**
   * Get the singleton instance of the Pi model registry.
   */
  static getInstance(): PiAdapterModelRegistry {
    if (!PiAdapterModelRegistry.instance) {
      PiAdapterModelRegistry.instance = new PiAdapterModelRegistry();
    }
    return PiAdapterModelRegistry.instance;
  }

  getAll(): ModelInfo[] {
    const seenProviders = new Set<string>();
    const models: ModelInfo[] = [];
    for (const model of getPiRegistry().getAll()) {
      models.push(toModelInfo(model, !seenProviders.has(model.provider)));
      seenProviders.add(model.provider);
    }
    return models;
  }

  getAvailable(): ModelInfo[] {
    const seenProviders = new Set<string>();
    const models: ModelInfo[] = [];
    for (const model of getPiRegistry().getAvailable()) {
      models.push(toModelInfo(model, !seenProviders.has(model.provider)));
      seenProviders.add(model.provider);
    }
    return models;
  }

  /**
   * Get the preferred provider based on available authentication.
   *
   * Priority:
   * 1. opencode (if OPENCODE_API_KEY is set)
   * 2. anthropic (if ANTHROPIC_API_KEY is set or OAuth configured)
   * 3. openai (if OPENAI_API_KEY is set or OAuth configured)
   * 4. First available provider
   */
  getPreferredProvider(): string {
    const available = getPiRegistry().getAvailable();

    if (available.length === 0) {
      return "unknown";
    }

    // Check for preferred providers in order
    for (const provider of ["opencode", "anthropic", "openai"]) {
      if (available.some((m) => m.provider === provider)) {
        return provider;
      }
    }

    // Fall back to first available
    return available[0]?.provider ?? "unknown";
  }

  find(provider: string, modelId: string): ModelInfo | undefined {
    const model = getPiRegistry().find(provider, modelId);
    return model ? toModelInfo(model, false) : undefined;
  }

  refresh(): void {
    getPiRegistry().refresh();
  }
}
