import type { AppSpec } from "@workhorse/protocol";
import { RESERVED } from "./reserved.ts";

/** Installed apps that take a reserved name. */
export function nameProblems(apps: readonly AppSpec[]): readonly string[] {
  return apps.flatMap((app) =>
    RESERVED.has(app.name) ? [`app name ${app.name} is reserved`] : [],
  );
}
