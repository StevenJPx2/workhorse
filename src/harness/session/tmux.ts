/**
 * Tmux session management for agent isolation
 *
 * Each agent runs in its own tmux session for process isolation.
 * Sessions are named with "jt-" prefix followed by ticket ID.
 */

/**
 * Represents a tmux session managed by Jiratown
 */
export interface TmuxSession {
  name: string;
  ticketId: string;
  workdir: string;
  createdAt: string;
}

/**
 * Options for tmux commands
 */
interface TmuxCommandOptions {
  detached?: boolean;
  sessionName?: string;
  targetSession?: string;
  startDirectory?: string;
  keys?: string;
  enter?: boolean;
  print?: boolean;
}

const SESSION_PREFIX = "jt-";

/**
 * Create a tmux session name from a ticket ID
 * Sanitizes invalid characters for tmux
 */
export function createTmuxSessionName(ticketId: string): string {
  // Replace invalid tmux session name characters with hyphens
  const sanitized = ticketId.replace(/[/:\.]/g, "-");
  return `${SESSION_PREFIX}${sanitized}`;
}

/**
 * Extract ticket ID from a tmux session name
 */
function extractTicketId(sessionName: string): string | null {
  if (!sessionName.startsWith(SESSION_PREFIX)) {
    return null;
  }
  return sessionName.slice(SESSION_PREFIX.length);
}

/**
 * Build a tmux command array
 */
export function buildTmuxCommand(
  command: string,
  options: TmuxCommandOptions
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
      if (options.keys) args.push(options.keys);
      if (options.enter) args.push("Enter");
      break;

    case "capture-pane":
      if (options.targetSession) args.push("-t", options.targetSession);
      if (options.print) args.push("-p");
      break;

    case "list-sessions":
      // No additional options needed
      break;
  }

  return args;
}

/**
 * Parse tmux list-sessions output into TmuxSession objects
 * Only returns sessions with the jiratown prefix
 */
export function parseTmuxList(output: string): TmuxSession[] {
  if (!output.trim()) {
    return [];
  }

  const sessions: TmuxSession[] = [];
  const lines = output.trim().split("\n");

  for (const line of lines) {
    // Format: "session-name: N windows (created Day Mon DD HH:MM:SS YYYY)"
    const match = line.match(/^([^:]+):/);
    if (!match) continue;

    const name = match[1];
    const ticketId = extractTicketId(name);

    if (ticketId) {
      sessions.push({
        name,
        ticketId,
        workdir: "", // Will be populated by separate query if needed
        createdAt: new Date().toISOString(),
      });
    }
  }

  return sessions;
}

/**
 * Execute a tmux command and return the result
 */
async function execTmux(
  args: string[]
): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: output.trim(),
      error: error.trim(),
    };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Check if tmux is available on the system
 */
export async function isTmuxAvailable(): Promise<boolean> {
  const result = await execTmux(["tmux", "-V"]);
  return result.success;
}

/**
 * Create a new tmux session for a ticket
 */
export async function createSession(
  ticketId: string,
  workdir: string
): Promise<TmuxSession | null> {
  const sessionName = createTmuxSessionName(ticketId);

  const cmd = buildTmuxCommand("new-session", {
    detached: true,
    sessionName,
    startDirectory: workdir,
  });

  const result = await execTmux(cmd);

  if (!result.success) {
    console.error(`Failed to create tmux session: ${result.error}`);
    return null;
  }

  return {
    name: sessionName,
    ticketId,
    workdir,
    createdAt: new Date().toISOString(),
  };
}

/**
 * List all Jiratown-managed tmux sessions
 */
export async function listSessions(): Promise<TmuxSession[]> {
  const cmd = buildTmuxCommand("list-sessions", {});
  const result = await execTmux(cmd);

  if (!result.success) {
    // "no server running" is expected when no sessions exist
    if (result.error.includes("no server running")) {
      return [];
    }
    return [];
  }

  return parseTmuxList(result.output);
}

/**
 * Check if a session exists for a ticket
 */
export async function sessionExists(ticketId: string): Promise<boolean> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("has-session", { targetSession: sessionName });
  const result = await execTmux(cmd);
  return result.success;
}

/**
 * Kill a tmux session for a ticket
 */
export async function killSession(ticketId: string): Promise<boolean> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("kill-session", { targetSession: sessionName });
  const result = await execTmux(cmd);
  return result.success;
}

/**
 * Send keys to a tmux session
 */
export async function sendKeys(
  ticketId: string,
  keys: string,
  pressEnter: boolean = true
): Promise<boolean> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("send-keys", {
    targetSession: sessionName,
    keys,
    enter: pressEnter,
  });
  const result = await execTmux(cmd);
  return result.success;
}

/**
 * Capture the current pane content from a tmux session
 */
export async function capturePane(ticketId: string): Promise<string | null> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("capture-pane", {
    targetSession: sessionName,
    print: true,
  });
  const result = await execTmux(cmd);

  if (!result.success) {
    return null;
  }

  return result.output;
}
