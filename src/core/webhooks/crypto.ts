/**
 * Cryptographic utilities for webhook signature verification
 */

/**
 * Verify GitHub webhook signature (HMAC SHA-256)
 *
 * GitHub sends the signature in the X-Hub-Signature-256 header
 * Format: sha256=<hex-encoded-signature>
 */
export async function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = signature.slice(7); // Remove "sha256=" prefix
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(computedSignature, expectedSignature);
}

/**
 * Verify Jira webhook signature
 *
 * Jira uses a shared secret sent as a query parameter or header.
 * This is simpler than GitHub's HMAC approach.
 */
export function verifyJiraSignature(
  providedSecret: string | undefined,
  expectedSecret: string,
): boolean {
  if (!providedSecret) return false;
  return timingSafeEqual(providedSecret, expectedSecret);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
