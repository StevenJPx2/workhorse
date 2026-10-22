/** Public API for pure capability decisions and client-protocol state transitions. */
export { deny, handle, newConnection } from "./connection/index.ts";

export type { Action, Apps, Connection, DenyReason, Step } from "./connection/index.ts";

export { decideRead, MAX_PATH_LENGTH } from "./fs/index.ts";

export type { ReadDecision } from "./fs/index.ts";
