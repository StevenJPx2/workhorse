import { createInterface } from "node:readline";
import { Effect } from "effect";

/** Ask a yes-or-no question on the terminal; only "y" or "yes" counts as yes. */
export function confirm(question: string): Effect.Effect<boolean> {
  return Effect.callback<boolean>((resume) => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });

    terminal.question(question, (answer) => {
      terminal.close();
      resume(Effect.succeed(["y", "yes"].includes(answer.trim().toLowerCase())));
    });
    terminal.on("close", () => resume(Effect.succeed(false)));

    return Effect.sync(() => terminal.close());
  });
}
