/**
 * ModelRegistry - Base class for adapter-specific model registries.
 *
 * Each AgentAdapter subclass should create its own ModelRegistry implementation
 * that provides access to available models for that harness.
 *
 * @module workflow/orchestrator/registry
 */

import type { ModelInfo } from "./types/adapter.ts";

/**
 * Base class for adapter-specific model registries.
 * Subclasses must implement all abstract methods to provide actual model data.
 *
 * @example
 * ```ts
 * class PiModelRegistry extends ModelRegistry {
 *   getAll(): ModelInfo[] { return [...piModels]; }
 *   getAvailable(): ModelInfo[] { return [...authenticatedPiModels]; }
 *   // ...
 * }
 * ```
 */
export abstract class ModelRegistry {
  /**
   * Get all models supported by this registry.
   * Includes models that may not have authentication configured.
   */
  abstract getAll(): ModelInfo[];

  /**
   * Get only models with authentication configured.
   * These are models that can actually be used.
   */
  abstract getAvailable(): ModelInfo[];

  /**
   * Get the preferred provider based on available authentication.
   * @returns Provider name or "unknown" if none available
   */
  abstract getPreferredProvider(): string;

  /**
   * Find a model by provider and ID.
   * @param provider - Provider name
   * @param modelId - Model ID
   * @returns Model info or undefined if not found
   */
  abstract find(provider: string, modelId: string): ModelInfo | undefined;

  /**
   * Refresh the model list from the underlying source.
   * Call this if model configuration has been modified.
   */
  abstract refresh(): void;
}
