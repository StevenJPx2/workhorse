import { readFileSync } from "node:fs";

/** Private dirty memory in MiB; clean file-backed pages are reclaimable and excluded. */
export function linuxPrivate(pid: string): number | undefined {
  const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
  const kilobytes = /^Private_Dirty:\s+(\d+) kB$/m.exec(rollup)?.[1];

  return kilobytes === undefined ? undefined : Number(kilobytes) / 1024;
}
