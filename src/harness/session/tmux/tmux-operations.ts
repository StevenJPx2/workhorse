import { type TmuxSession } from "./types.ts";
import { createTmuxSessionName, buildTmuxCommand, parseTmuxList } from "./tmux-utils.ts";

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

export async function isTmuxAvailable(): Promise<boolean> {
  const result = await execTmux(["tmux", "-V"]);
  return result.success;
}

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

export async function listSessions(): Promise<TmuxSession[]> {
  const cmd = buildTmuxCommand("list-sessions", {});
  const result = await execTmux(cmd);

  if (!result.success) {
    if (result.error.includes("no server running")) {
      return [];
    }
    return [];
  }

  return parseTmuxList(result.output);
}

export async function sessionExists(ticketId: string): Promise<boolean> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("has-session", { targetSession: sessionName });
  const result = await execTmux(cmd);
  return result.success;
}

export async function killSession(ticketId: string): Promise<boolean> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("kill-session", { targetSession: sessionName });
  const result = await execTmux(cmd);
  return result.success;
}

export async function sendKeys(
  ticketId: string,
  keys: string,
  pressEnter: boolean = true
): Promise<boolean> {
  const sessionName = createTmuxSessionName(ticketId);

  const textCmd = buildTmuxCommand("send-keys", {
    targetSession: sessionName,
    keys,
    literal: true,
    enter: false,
  });
  const textResult = await execTmux(textCmd);

  if (!textResult.success) {
    return false;
  }

  if (pressEnter) {
    const enterCmd = buildTmuxCommand("send-keys", {
      targetSession: sessionName,
      keys: "",
      enter: true,
    });
    const enterResult = await execTmux(enterCmd);
    return enterResult.success;
  }

  return true;
}

export async function capturePane(
  ticketId: string,
  startLine: number = -100
): Promise<string | null> {
  const sessionName = createTmuxSessionName(ticketId);
  const cmd = buildTmuxCommand("capture-pane", {
    targetSession: sessionName,
    print: true,
    startLine,
  });
  const result = await execTmux(cmd);

  if (!result.success) {
    return null;
  }

  return result.output;
}