import { boolean, contextTag, octetString, oid, sequence } from "./der/index.ts";

const SUBJECT_ALT_NAME = "2.5.29.17";
const BASIC_CONSTRAINTS = "2.5.29.19";
const DNS_NAME = 2;

/**
 * The extensions of a pinned self-signed certificate: one DNS name in subjectAltName, which
 * TLS clients check, and critical basicConstraints CA:TRUE, so the certificate is its own anchor.
 */
export function certificateExtensions(dnsName: string): Uint8Array {
  const altName = sequence([contextTag(DNS_NAME, "implicit", new TextEncoder().encode(dnsName))]);

  return sequence([
    sequence([oid(SUBJECT_ALT_NAME), octetString(altName)]),
    sequence([oid(BASIC_CONSTRAINTS), boolean(true), octetString(sequence([boolean(true)]))]),
  ]);
}
