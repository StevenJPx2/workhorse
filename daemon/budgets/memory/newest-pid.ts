import { spawnSync } from "node:child_process";

/** The daemon itself, not bubblewrap (whose command line also mentions workerd). */
export function newestPid(workerd: string): string | undefined {
  const pid = spawnSync("pgrep", ["-n", "-f", `^${workerd} serve`], {
    encoding: "utf8",
  }).stdout.trim();

  return pid === "" ? undefined : pid;
}
