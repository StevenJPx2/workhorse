/**
 * Setup command module
 */

export { default } from "./command.ts";
export { runSetup } from "./run.ts";
export {
  checkDependency,
  checkAllDependencies,
  DEPENDENCIES,
  type Dependency,
} from "./dependencies.ts";
