import { generateKeyPairSync, X509Certificate } from "node:crypto";
import { DateTime } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  bitString,
  boolean,
  contextTag,
  oid,
  sequence,
  time,
  unsignedInteger,
  utf8String,
} from "../src/identity/der/index.ts";
import { selfSignedCertificate } from "../src/identity/self-signed-certificate.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("DER", () => {
  it("encodes object identifiers with multi-byte arcs", () => {
    // ecdsa-with-SHA256, as it appears in every P-256 certificate.
    expect(hex(oid("1.2.840.10045.4.3.2"))).toBe("06082a8648ce3d040302");
    expect(hex(oid("2.5.4.3"))).toBe("0603550403");
  });

  it("encodes integers minimally and keeps them positive", () => {
    expect(hex(unsignedInteger(Uint8Array.of(0, 0, 5)))).toBe("020105");
    expect(hex(unsignedInteger(Uint8Array.of(0x80)))).toBe("02020080");
    expect(hex(unsignedInteger(Uint8Array.of(0)))).toBe("020100");
  });

  it("uses long-form lengths from 128 bytes", () => {
    expect(hex(utf8String("a".repeat(127))).slice(0, 4)).toBe("0c7f");
    expect(hex(utf8String("a".repeat(128))).slice(0, 6)).toBe("0c8180");
    expect(hex(utf8String("a".repeat(300))).slice(0, 8)).toBe("0c82012c");
  });

  it("encodes booleans, bit strings, sequences and context tags", () => {
    expect(hex(boolean(true))).toBe("0101ff");
    expect(hex(bitString(Uint8Array.of(0xab)))).toBe("030200ab");
    expect(hex(sequence([boolean(false)]))).toBe("3003010100");
    expect(hex(contextTag(0, "explicit", boolean(true)))).toBe("a0030101ff");
    expect(hex(contextTag(2, "implicit", Uint8Array.of(0x61)))).toBe("820161");
  });

  it("switches from UTCTime to GeneralizedTime in 2050", () => {
    expect(latin1(time(DateTime.makeUnsafe("2049-12-31T23:59:59Z")))).toBe("\x17\x0d491231235959Z");
    expect(latin1(time(DateTime.makeUnsafe("2050-01-01T00:00:00Z")))).toBe(
      "\x18\x0f20500101000000Z",
    );
  });
});

describe("selfSignedCertificate", () => {
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const other = generateKeyPairSync("ec", { namedCurve: "P-256" });

  const fields = {
    name: "daemon.workhorse",
    serial: Uint8Array.of(0x9f, ...Array.from({ length: 15 }, (_, i) => i)),
    notBefore: DateTime.makeUnsafe("2026-10-22T00:00:00Z"),
    notAfter: DateTime.makeUnsafe("2036-10-22T00:00:00Z"),
  };

  const certificate = new X509Certificate(
    selfSignedCertificate(fields, keys.publicKey, keys.privateKey),
  );

  it("is a valid certificate signed by its own key, and only by it", () => {
    expect(certificate.verify(keys.publicKey)).toBe(true);
    expect(certificate.verify(other.publicKey)).toBe(false);
    expect(certificate.checkIssued(certificate)).toBe(true);
    expect(certificate.publicKey.equals(keys.publicKey)).toBe(true);
  });

  it("states the name, validity, serial, and CA flag", () => {
    expect(certificate.subject).toBe("CN=daemon.workhorse");
    expect(certificate.issuer).toBe("CN=daemon.workhorse");
    expect(certificate.subjectAltName).toBe("DNS:daemon.workhorse");
    expect(certificate.checkHost("daemon.workhorse")).toBe("daemon.workhorse");
    expect(certificate.checkHost("other.workhorse")).toBeUndefined();
    expect(certificate.ca).toBe(true);
    expect(DateTime.formatIso(DateTime.makeUnsafe(certificate.validFromDate))).toBe(
      "2026-10-22T00:00:00.000Z",
    );
    expect(DateTime.formatIso(DateTime.makeUnsafe(certificate.validToDate))).toBe(
      "2036-10-22T00:00:00.000Z",
    );
    expect(certificate.serialNumber.toLowerCase()).toBe("9f000102030405060708090a0b0c0d0e");
  });
});
