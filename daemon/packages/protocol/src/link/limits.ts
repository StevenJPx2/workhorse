/** Each side sends `link.ping` this often, so the other can tell the link is alive. */
export const HEARTBEAT_MS = 5000;

/** A side drops the link after this long without any message from the peer: three heartbeats. */
export const SILENCE_LIMIT_MS = 3 * HEARTBEAT_MS;

/** Connecting, TLS, upgrade and handshake together; a peer that never finishes TLS stalls a dial. */
export const DIAL_DEADLINE_MS = 5000;

/** A call crossing a link that gets no answer by then returns `unavailable`. */
export const CALL_DEADLINE_MS = 10_000;

/** Waits between failed dials; the last repeats. */
export const REDIAL_BACKOFF_MS: readonly number[] = [100, 250, 500, 1000, 2000];
