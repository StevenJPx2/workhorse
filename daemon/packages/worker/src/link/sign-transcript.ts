import type { Transcript } from "@workhorse/core";
import { linkTranscript, toBase64url } from "@workhorse/protocol";
import { type Cause, Effect } from "effect";

/** Sign a handshake transcript with this daemon's private key. */
export function signTranscript(
  privateKey: CryptoKey,
  transcript: Transcript,
): Effect.Effect<string, Cause.UnknownError> {
  const bytes = linkTranscript(transcript.signer, transcript.dialer, transcript.acceptor);

  return Effect.map(
    Effect.tryPromise(() => crypto.subtle.sign({ name: "Ed25519" }, privateKey, bytes)),
    (signature) => toBase64url(new Uint8Array(signature)),
  );
}
