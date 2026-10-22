import { type KeyObject, sign } from "node:crypto";
import type { DateTime } from "effect";
import { certificateExtensions } from "./certificate-extensions.ts";
import {
  bitString,
  contextTag,
  oid,
  sequence,
  set,
  time,
  unsignedInteger,
  utf8String,
} from "./der/index.ts";
import { pem } from "./pem.ts";

/** What one self-signed certificate states. The caller supplies time and randomness. */
export type CertificateFields = {
  /** The DNS name peers check (`certificateHost`); also the common name. */
  readonly name: string;
  /** Random serial bytes; at most 20 (RFC 5280, 4.1.2.2). */
  readonly serial: Uint8Array;
  readonly notBefore: DateTime.Utc;
  readonly notAfter: DateTime.Utc;
};

const ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2";
const COMMON_NAME = "2.5.4.3";

/**
 * A self-signed X.509 v3 certificate for an ECDSA P-256 key, as PEM. Peers pin this exact
 * certificate and check `fields.name`, so it works whatever address the peer is reached at.
 */
export function selfSignedCertificate(
  fields: CertificateFields,
  publicKey: KeyObject,
  privateKey: KeyObject,
): string {
  const algorithm = sequence([oid(ECDSA_WITH_SHA256)]);
  const name = sequence([set(sequence([oid(COMMON_NAME), utf8String(fields.name)]))]);

  const tbs = sequence([
    contextTag(0, "explicit", unsignedInteger(Uint8Array.of(2))),
    unsignedInteger(fields.serial),
    algorithm,
    name,
    sequence([time(fields.notBefore), time(fields.notAfter)]),
    name,
    publicKey.export({ type: "spki", format: "der" }),
    contextTag(3, "explicit", certificateExtensions(fields.name)),
  ]);

  const signature = sign("sha256", tbs, { key: privateKey, dsaEncoding: "der" });

  return pem("CERTIFICATE", sequence([tbs, algorithm, bitString(signature)]));
}
