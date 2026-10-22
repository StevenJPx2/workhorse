import { readFileSync, writeFileSync } from "node:fs";
import { type Peer, Policy } from "@workhorse/protocol";
import { Effect, Schema } from "effect";
import { InstallError } from "../inputs.ts";

const decodePolicy = Schema.decodeEffect(Schema.fromJsonString(Policy), {
  onExcessProperty: "error",
});

/**
 * Add a peer to the policy file. The file is decoded strictly but otherwise kept as written:
 * roots stay as the user wrote them (`~/notes`), since install resolves them. A name already
 * paired is refused rather than replaced.
 */
export const addPeer = Effect.fnUntraced(function* (
  file: string,
  name: string,
  peer: Peer,
): Effect.fn.Return<void, InstallError> {
  const text = yield* Effect.try({
    try: () => readFileSync(file, "utf8"),
    catch: () => new InstallError({ message: `cannot read the policy ${file}` }),
  });

  const policy = yield* Effect.mapError(
    decodePolicy(text),
    (error) => new InstallError({ message: `invalid policy ${file}: ${error.message}` }),
  );

  if (Object.hasOwn(policy.peers ?? {}, name))
    return yield* new InstallError({ message: `${file} already pairs a peer named ${name}` });

  const updated: Policy = { ...policy, peers: { ...policy.peers, [name]: peer } };

  return yield* Effect.try({
    try: () => writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`),
    catch: () => new InstallError({ message: `cannot write the policy ${file}` }),
  });
});
