// Writes <dir>/<side>-key.pem and <dir>/<side>-cert.pem with the CLI's built-in encoder, so the
// spike can prove workerd's TLS accepts its certificates. Usage: bun make-cert.ts <dir> <side>
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { selfSignedCertificate } from "../../daemon/packages/cli/src/identity/self-signed-certificate.ts";

const [dir = ".", side = "home"] = process.argv.slice(2);
const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
const now = Date.now();

const certificate = selfSignedCertificate(
  {
    name: "peer.workhorse",
    serial: randomBytes(16),
    notBefore: new Date(now - 60_000),
    notAfter: new Date(now + 10 * 365 * 86_400_000),
  },
  keys.publicKey,
  keys.privateKey,
);

writeFileSync(join(dir, `${side}-cert.pem`), certificate);
writeFileSync(join(dir, `${side}-key.pem`), keys.privateKey.export({ type: "pkcs8", format: "pem" }));
console.log(`wrote ${side} key and certificate to ${dir}`);
