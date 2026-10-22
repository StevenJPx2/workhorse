import { spawnSync } from "node:child_process";

const MEGABYTES_PER: ReadonlyMap<string, number> = new Map([
  ["KB", 1 / 1024],
  ["MB", 1],
  ["GB", 1024],
]);

/** Physical footprint in MiB, the process cost shown by Activity Monitor. */
export function macFootprint(pid: string): number | undefined {
  const footprint = spawnSync("footprint", ["-p", pid], { encoding: "utf8" }).stdout;
  const [, amount, unit] = /phys_footprint:\s+([\d.]+)\s*(KB|MB|GB)/.exec(footprint) ?? [];
  const scale = MEGABYTES_PER.get(unit ?? "");

  return scale === undefined ? undefined : Number(amount) * scale;
}
