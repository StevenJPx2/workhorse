import { readFileSync } from "node:fs";
import { Certificate, Identity } from "@workhorse/protocol";
import { Effect, Schema } from "effect";
import { InstallError } from "../inputs.ts";
import type { Layout } from "../layout.ts";

/** What a peer pins for this daemon: its public key and its TLS certificate. */
export type PublicIdentity = { readonly key: string; readonly certificate: string };

const decodeIdentity = Schema.decodeEffect(Schema.fromJsonString(Identity));
const decodeCertificate = Schema.decodeEffect(Certificate);

const readText = (file: string) =>
  Effect.try({
    try: () => readFileSync(file, "utf8"),
    catch: () => new InstallError({ message: `${file} is missing; run workhorse install first` }),
  });

/** This daemon's public identity, from the files `workhorse install` made. Never the private key. */
export const readPublicIdentity = Effect.fnUntraced(function* (
  layout: Layout,
): Effect.fn.Return<PublicIdentity, InstallError> {
  const identity = yield* readText(layout.identity).pipe(
    Effect.flatMap(decodeIdentity),
    Effect.mapError(() => new InstallError({ message: `${layout.identity} is not valid` })),
  );

  const certificate = yield* readText(layout.tlsCertificate).pipe(
    Effect.flatMap(decodeCertificate),
    Effect.mapError(() => new InstallError({ message: `${layout.tlsCertificate} is not valid` })),
  );

  return { key: identity.x, certificate };
});
