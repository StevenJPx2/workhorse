import { linuxPrivate } from "./linux-private.ts";
import { macFootprint } from "./mac-footprint.ts";
import { newestPid } from "./newest-pid.ts";

/** Memory that the OS cannot reclaim: Private_Dirty on Linux, phys_footprint on macOS. */
export function privateMegabytes(workerd: string): number | undefined {
  const pid = newestPid(workerd);

  return pid === undefined
    ? undefined
    : process.platform === "linux"
      ? linuxPrivate(pid)
      : macFootprint(pid);
}
