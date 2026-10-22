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
  };
}
