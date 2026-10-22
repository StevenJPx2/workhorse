import { join } from "node:path";

// Everything one daemon owns lives under its base folder. The sandbox grants these folders.
export type Layout = {
  readonly base: string;
  readonly bin: string;
  readonly etc: string;
  readonly state: string;
  readonly sock: string;
  readonly log: string;
  readonly workerd: string;
  readonly config: string;
  readonly bundle: string;
  readonly deployment: string;
  // The exact command the service manager runs, sandbox included; `workhorse daemon` runs it too.
  readonly command: string;
  readonly socket: string;
  // This daemon's Ed25519 key pair (JWK). Made once and kept, so pairings survive reinstalls.
  readonly identity: string;
  // Its self-signed TLS key and certificate for links, also made once and kept.
  readonly tlsKey: string;
  readonly tlsCertificate: string;
  // The `host:port` links are accepted on, when installed with --listen; `workhorse pair` reads it.
  readonly listen: string;
};

// sockaddr_un holds 104 bytes on macOS (108 on Linux), including the terminating NUL.
export const MAX_SOCKET_PATH = 103;

export function layoutOf(base: string): Layout {
  const etc = join(base, "etc");
  const sock = join(base, "sock");

  return {
    base,
    bin: join(base, "bin"),
    etc,
    state: join(base, "state"),
    sock,
    log: join(base, "log"),
    workerd: join(base, "bin", "workerd"),
    config: join(etc, "config.capnp"),
    bundle: join(etc, "daemon.js"),
    deployment: join(etc, "deployment.json"),
    command: join(etc, "command.json"),
    socket: join(sock, "daemon.sock"),
    identity: join(etc, "identity.json"),
    tlsKey: join(etc, "tls-key.pem"),
    tlsCertificate: join(etc, "tls-certificate.pem"),
    listen: join(etc, "listen"),
  };
}

/** The file holding a dialed peer's pinned certificate; the config embeds it by this name. */
export function peerCertificateFile(peer: string): string {
  return `peer-${peer}.pem`;
}
