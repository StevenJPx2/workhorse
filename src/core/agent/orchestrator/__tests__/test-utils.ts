import { cleanupTestWorktreesAfterAll } from "../../../../test/cleanup-worktrees.ts";

cleanupTestWorktreesAfterAll();

export function createMockSubprocess(exitCode: number, stdout: string = "", stderr: string = "") {
  return {
    stdout: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stdout));
        controller.close();
      },
    }),
    stderr: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stderr));
        controller.close();
      },
    }),
    exited: Promise.resolve(exitCode),
    kill: () => {},
    stdin: new WritableStream(),
    terminal: undefined,
    stdio: [],
    readable: new ReadableStream(),
    writable: new WritableStream(),
    pid: 12345,
    unref: () => {},
    ref: () => {},
    send: () => true,
    disconnect: () => {},
    signalCode: null,
    exitCode: null,
    resourceUsage: null,
    killed: false,
    [Symbol.asyncDispose]: async () => {},
  } as unknown as ReturnType<typeof Bun.spawn>;
}

export function successMockSpawn(
  overrides?: Record<string, ReturnType<typeof createMockSubprocess>>,
) {
  return ((cmd: string[]) => {
    const command = cmd.join(" ");
    if (overrides?.[command]) return overrides[command];
    if (command.includes("worktree list")) return createMockSubprocess(0, "");
    if (command.includes("fetch")) return createMockSubprocess(0, "");
    if (command.includes("worktree add")) return createMockSubprocess(0, "Preparing worktree");
    if (command.includes("tmux has-session")) return createMockSubprocess(1);
    if (command.includes("tmux new-session")) return createMockSubprocess(0, "");
    if (command.includes("tmux send-keys")) return createMockSubprocess(0);
    return createMockSubprocess(0);
  }) as unknown as typeof Bun.spawn;
}
