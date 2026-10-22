/** Public API for pure capability decisions and client-protocol state transitions. */
export { deny, handle, newConnection } from "./connection/index.ts";

export type {
  Action,
  Apps,
  Connection,
  DenyReason,
  Directory,
  LocalAction,
  Step,
} from "./connection/index.ts";

export { decideRead, MAX_PATH_LENGTH } from "./fs/index.ts";

export { acceptLink, dialLink, linkStep } from "./link/index.ts";

export type {
  LinkContext,
  LinkEffect,
  LinkEvent,
  LinkPeer,
  LinkState,
  LinkStep,
  Peers,
  Transcript,
} from "./link/index.ts";

export type { ReadDecision } from "./fs/index.ts";
