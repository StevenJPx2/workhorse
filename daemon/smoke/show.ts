// What the smoke scripts share: printing a call and its reply, and the shell one-liner that
// repeats it by hand.
import type { Client } from "@workhorse/conformance/client";
import type { Json } from "@workhorse/protocol";
import { Console, Effect, Schema } from "effect";

export class SmokeFailed extends Schema.TaggedError<
  SmokeFailed,
  { readonly SmokeFailed: unique symbol }
>()("SmokeFailed", {
  message: Schema.String,
}) {}

/** Send one request and print it and the reply, prefixed by who sent it when there are several. */
export function show(
  client: Client,
  method: string,
  params: Json,
  who = "",
): Effect.Effect<void, SmokeFailed> {
  const indent = who === "" ? "" : `${" ".repeat(who.length)} `;

  return Effect.tryPromise({
    try: () => client.request(method, params),
    catch: (cause) => new SmokeFailed({ message: String(cause) }),
  }).pipe(
    Effect.flatMap((response) =>
      Console.log(
        `${who === "" ? "" : `${who} `}→ ${JSON.stringify({ jsonrpc: "2.0", id: response.id, method, params })}\n${indent}← ${JSON.stringify(response)}\n`,
      ),
    ),
  );
}

/** Run a smoke script's program: exit code 0, or 1 after printing why it failed. */
export function runSmoke(program: Effect.Effect<void, SmokeFailed>): Promise<number> {
  return Effect.runPromise(
    program.pipe(
      Effect.as(0),
      Effect.catchTag("SmokeFailed", (error) =>
        Effect.as(Console.error(`smoke: ${error.message}`), 1),
      ),
    ),
  );
}

/** A shell line that says hello to the daemon at `socket`, then makes one call. */
export function oneLiner(socket: string, method: string, params: Json): string {
  const hello = '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"protocol":[1]}}';
  const call = JSON.stringify({ jsonrpc: "2.0", id: 2, method, params });

  return `  printf '%s\\n' '${hello}' \\\n    '${call}' | nc -U -w 1 ${socket}`;
}
