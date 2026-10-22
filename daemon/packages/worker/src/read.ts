import { decideRead } from "@workhorse/core";
import { type Deployment, MAX_READ_BYTES, type Outcome, rootBinding } from "@workhorse/protocol";
import { type Cause, Effect, Option, Schema } from "effect";
import { denied, failed, invalidParams } from "./outcome.ts";

export type ReadPlan =
  | { readonly type: "answer"; readonly outcome: Outcome }
  | { readonly type: "fetch"; readonly binding: `fs:${string}`; readonly url: string };

const decodeArgs = Schema.decodeUnknownOption(Schema.Tuple([Schema.String, Schema.String]));

const answer = (outcome: Outcome): ReadPlan => ({ type: "answer", outcome });

// Decides an app's read without touching the disk: either the answer, or what to fetch. `app`
// is set by the daemon when it loads the app; `args` come from the app and are untrusted.
export function planRead(
  deployment: Option.Option<Deployment>,
  app: string,
  args: readonly Schema.Json[],
): ReadPlan {
  const decoded = decodeArgs(args);

  if (Option.isNone(decoded)) return answer(invalidParams("read needs (root, path) strings"));

  if (Option.isNone(deployment)) return answer(failed("invalid_deployment"));
  const [root, path] = decoded.value;
  const apps = deployment.value.policy.apps;
  const decision = decideRead(Object.hasOwn(apps, app) ? apps[app]?.fs : undefined, root, path);

  if (decision.type === "denied") return answer(denied("fs.read", decision.reason));

  if (decision.type === "invalid_path") return answer(invalidParams("invalid path"));
  // Each segment is encoded, so a name such as "%2e%2e" stays a literal file name.
  const url = `http://fs/${decision.segments.map(encodeURIComponent).join("/")}`;

  return { type: "fetch", binding: rootBinding(app, decision.root), url };
}

// The disk directory's reply. The OS sandbox's refusals arrive as opaque server errors.
export const readResponse = Effect.fnUntraced(function* (
  response: Response,
): Effect.fn.Return<Outcome, Cause.UnknownError> {
  if (response.status === 404) return failed("not_found");

  if (!response.ok || response.body === null) return failed("unreadable");

  return yield* readText(response.body);
});

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

// Reads at most MAX_READ_BYTES; a larger file is refused, never truncated.
const readText = Effect.fnUntraced(function* (
  body: ReadableStream<Uint8Array>,
): Effect.fn.Return<Outcome, Cause.UnknownError> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const chunk = yield* Effect.tryPromise(() => reader.read());

    if (chunk.done) break;
    total += chunk.value.length;

    if (total > MAX_READ_BYTES) {
      yield* Effect.tryPromise(() => reader.cancel());

      return failed("too_large");
    }

    chunks.push(chunk.value);
  }

  const text = yield* Effect.option(Effect.try(() => decoder.decode(concat(chunks, total))));

  return Option.isSome(text) ? { result: { text: text.value } } : failed("not_text");
});

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}
