import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { InstallError } from "../inputs.ts";
import { hostPort } from "./host-port.ts";

/** The port this daemon accepts links on, which install recorded from --listen. */
export function linkPort(file: string): Effect.Effect<number, InstallError> {
  return Effect.try({
    try: () => hostPort(readFileSync(file, "utf8").trim()).port,
    catch: () =>
      new InstallError({ message: "this daemon accepts no links; install it with --listen first" }),
  });
}
