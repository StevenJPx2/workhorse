import { defu } from "defu";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { deepCamelKeys, deepSnakeKeys } from "string-ts";

import type { DeepPartial, WorkhorseConfig } from "./types.ts";

export function parseTomlFile(
  filePath: string | null,
): Partial<WorkhorseConfig> {
  if (!filePath) return {};
  if (!existsSync(filePath)) return {};

  try {
    return deepCamelKeys(
      parseToml(readFileSync(filePath, "utf-8")),
    ) as Partial<WorkhorseConfig>;
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
    return {};
  }
}

// Last arg wins. Call as mergeConfigs(base, global, project) → project wins.
export function mergeConfigs(
  base: WorkhorseConfig,
  ...overrides: DeepPartial<WorkhorseConfig>[]
): WorkhorseConfig {
  let result = base;
  for (const override of overrides) {
    result = defu(override, result) as WorkhorseConfig;
  }
  return result;
}

export function configToToml(config: Partial<WorkhorseConfig>): string {
  return stringifyToml(deepSnakeKeys(config) as Record<string, unknown>);
}

export function writeTomlFile(
  filePath: string,
  config: Partial<WorkhorseConfig>,
): void {
  writeFileSync(filePath, configToToml(config), "utf-8");
}
