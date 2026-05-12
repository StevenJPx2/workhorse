import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { defu } from "defu";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { deepCamelKeys, deepSnakeKeys } from "string-ts";
import type { DeepPartial, JiratownConfig } from "./types.ts";

export function parseTomlFile(filePath: string | null): Partial<JiratownConfig> {
  if (!filePath) return {};
  if (!existsSync(filePath)) return {};

  try {
    return deepCamelKeys(parseToml(readFileSync(filePath, "utf-8"))) as Partial<JiratownConfig>;
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
    return {};
  }
}

// Last arg wins. Call as mergeConfigs(base, global, project) → project wins.
export function mergeConfigs(
  base: JiratownConfig,
  ...overrides: DeepPartial<JiratownConfig>[]
): JiratownConfig {
  let result = base;
  for (const override of overrides) {
    result = defu(override, result) as JiratownConfig;
  }
  return result;
}

export function configToToml(config: Partial<JiratownConfig>): string {
  return stringifyToml(deepSnakeKeys(config) as Record<string, unknown>);
}

export function writeTomlFile(filePath: string, config: Partial<JiratownConfig>): void {
  writeFileSync(filePath, configToToml(config), "utf-8");
}
