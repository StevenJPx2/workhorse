import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { CERTIFICATE_NAME } from "@workhorse/protocol";
import { DateTime, Effect } from "effect";
import { InstallError } from "../inputs.ts";
import type { Layout } from "../layout.ts";
import { selfSignedCertificate } from "./self-signed-certificate.ts";

/**
 * Make this daemon's Ed25519 identity and its self-signed TLS certificate, unless they exist.
 * They are kept across reinstalls: peers pin both, so replacing them would undo every pairing.
 * The private keys are readable by their owner only.
 */
export const ensureIdentity = Effect.fnUntraced(function* (
  layout: Layout,
): Effect.fn.Return<void, InstallError> {
  const now = yield* DateTime.now;

  yield* Effect.try({
    try: () => {
      if (!existsSync(layout.identity)) {
        const { privateKey } = generateKeyPairSync("ed25519");
        const jwk = privateKey.export({ format: "jwk" });

        writeFileSync(
          layout.identity,
          JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, d: jwk.d }),
          { mode: 0o600 },
        );
      }

      if (!existsSync(layout.tlsKey) || !existsSync(layout.tlsCertificate)) {
        const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });

        const fields = {
          name: CERTIFICATE_NAME,
          serial: randomBytes(16),
          notBefore: DateTime.subtract(now, { hours: 1 }),
          notAfter: DateTime.add(now, { years: 25 }),
        };

        writeFileSync(layout.tlsKey, keys.privateKey.export({ type: "pkcs8", format: "pem" }), {
          mode: 0o600,
        });
        writeFileSync(
          layout.tlsCertificate,
          selfSignedCertificate(fields, keys.publicKey, keys.privateKey),
        );
      }
    },
    catch: (cause) => new InstallError({ message: `cannot make the identity: ${String(cause)}` }),
  });
});
