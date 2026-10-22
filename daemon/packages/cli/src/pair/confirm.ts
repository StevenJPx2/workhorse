import { createInterface } from "node:readline";
import { Effect } from "effect";

/**
 * Ask a yes-or-no question; only "y" or "yes" counts as yes, and input that ends unanswered is
 * no. `input` and `output` are the terminal unless a caller passes others.
 */
export function confirm(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Effect.Effect<boolean> {
  return Effect.callback<boolean>((resume) => {
    const terminal = createInterface({ input, output });
    let answered = false;

    // Only the first outcome counts: closing the terminal after an answer emits "close" at once.
    const settle = (yes: boolean) => {
      if (answered) return;
      answered = true;
      resume(Effect.succeed(yes));
    };

    terminal.question(question, (answer) => {
      settle(["y", "yes"].includes(answer.trim().toLowerCase()));
      terminal.close();
    });
    terminal.on("close", () => settle(false));

    return Effect.sync(() => terminal.close());
  });
}
