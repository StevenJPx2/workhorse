import type { Transcript } from "@workhorse/core";
import { fromBase64url, linkTranscript } from "@workhorse/protocol";
import { Effect } from "effect";

/** Whether `signature` is `key`'s signature over the transcript. Any failure counts as no. */
export function verifyTranscript(
  key: string,
  signature: string,
  transcript: Transcript,
): Effect.Effect<boolean> {
  const bytes = linkTranscript(transcript.signer, transcript.dialer, transcript.acceptor);

  return Effect.tryPromise(() =>
    crypto.subtle.importKey("raw", fromBase64url(key), { name: "Ed25519" }, false, ["verify"]),
  ).pipe(
    Effect.flatMap((publicKey) =>
      Effect.tryPromise(() =>
        crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromBase64url(signature), bytes),
      ),
    ),
    Effect.orElseSucceed(() => false),
  );
}
