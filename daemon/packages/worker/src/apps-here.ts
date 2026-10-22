import type { Apps } from "@workhorse/core";
import type { AppSpec, Deployment } from "@workhorse/protocol";

/** The apps loaded on this daemon: their public operations for core, their specs for loading. */
export type AppsHere = { readonly apps: Apps; readonly specs: ReadonlyMap<string, AppSpec> };

/** The apps a deployment loads here. */
export function appsHere(deployment: Deployment): AppsHere {
  return {
    apps: new Map(deployment.apps.map((app) => [app.name, new Set(app.operations)])),
    specs: new Map(deployment.apps.map((app) => [app.name, app])),
  };
}
