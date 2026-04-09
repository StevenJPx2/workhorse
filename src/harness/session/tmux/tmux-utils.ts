import { type TmuxSession, SESSION_PREFIX } from "./types.ts";

export function createTmuxSessionName(ticketId: string): string {
  const sanitized = ticketId.replace(/[/:.]/g, "-");
  return `${SESSION_PREFIX}${sanitized}`;
}

function extractTicketId(sessionName: string): string | null {
  if (!sessionName.startsWith(SESSION_PREFIX)) {
    return null;
  }
  return sessionName.slice(SESSION_PREFIX.length);
}

export function buildTmuxCommand(
  command: string,
  options: import("./types.ts").TmuxCommandOptions
): string[] {
  const args: string[] = ["tmux", command];

  switch (command) {
    case "new-session":
      if (options.detached) args.push("-d");
      if (options.sessionName) args.push("-s", options.sessionName);
      if (options.startDirectory) args.push("-c", options.startDirectory);
      break;

    case "kill-session":
    case "has-session":
      if (options.targetSession) args.push("-t", options.targetSession);
      break;

    case "send-keys":
      if (options.targetSession) args.push("-t", options.targetSession);
      if (options.literal) args.push("-l");
      if (options.keys) args.push(options.keys);
      if (options.enter) args.push("Enter");
      break;

    case "capture-pane":
      if (options.targetSession) args.push("-t", options.targetSession);
      if (options.print) args.push("-p");
      if (options.startLine !== undefined) args.push("-S", String(options.startLine));
      break;

    case "list-sessions":
      break;
  }

  return args;
}

export function parseTmuxList(output: string): TmuxSession[] {
  if (!output.trim()) {
    return [];
  }

  const sessions: TmuxSession[] = [];
  const lines = output.trim().split("\n");

  for (const line of lines) {
    const match = line.match(/^([^:]+):/);
    if (!match) continue;

    const name = match[1];
    const ticketId = extractTicketId(name);

    if (ticketId) {
      sessions.push({
        name,
        ticketId,
        workdir: "",
        createdAt: new Date().toISOString(),
      });
    }
  }

  return sessions;
}