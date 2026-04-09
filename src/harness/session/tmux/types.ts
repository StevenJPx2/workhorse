export interface TmuxSession {
  name: string;
  ticketId: string;
  workdir: string;
  createdAt: string;
}

interface TmuxCommandOptions {
  detached?: boolean;
  sessionName?: string;
  targetSession?: string;
  startDirectory?: string;
  keys?: string;
  enter?: boolean;
  print?: boolean;
  literal?: boolean;
}

const SESSION_PREFIX = "jt-";

export { TmuxCommandOptions, SESSION_PREFIX };