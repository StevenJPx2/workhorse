/**
 * The peer a forwarded upgrade belongs to, set by the daemon's own fetch handler after it looks
 * up the dialer's key. The handler overwrites any value a dialer sends.
 */
export const PEER_HEADER = "workhorse-peer";
