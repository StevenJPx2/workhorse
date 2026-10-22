/** State for one client; protocol negotiation moves it from greeting to ready. */
export type Connection =
  | { readonly phase: "greeting" }
  | { readonly phase: "ready"; readonly version: number };

/** Initial state for a client that has not completed protocol negotiation. */
export const newConnection: Connection = { phase: "greeting" };
