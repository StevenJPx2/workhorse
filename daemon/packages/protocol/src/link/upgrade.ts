/**
 * The name every daemon's self-signed certificate states. A dialer pins the peer's exact
 * certificate and checks this name, so the address it dials can be anything.
 */
export const CERTIFICATE_NAME = "daemon.workhorse";

/** The path of the WebSocket upgrade that opens a link. */
export const LINK_PATH = "/link";

/**
 * The dialer's public key on the upgrade request, so the acceptor can hand the socket to that
 * peer's Link object. It only routes: the handshake proves the key.
 */
export const LINK_KEY_HEADER = "workhorse-key";
