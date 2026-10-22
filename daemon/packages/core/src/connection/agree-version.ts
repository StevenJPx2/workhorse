import { SUPPORTED_VERSIONS } from "@workhorse/protocol/constants";

/** The highest protocol version both sides speak, or undefined when they share none. */
export function agreeVersion(offered: readonly number[]): number | undefined {
  const agreed = Math.max(...offered.filter((version) => SUPPORTED_VERSIONS.includes(version)));

  return agreed === -Infinity ? undefined : agreed;
}
