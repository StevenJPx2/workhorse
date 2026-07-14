import type { GlobalContext } from "../orchestrator";

export interface Service {
  name: string;
  setup(context: GlobalContext): void | Promise<void>;
  teardown(): void | Promise<void>;
}
