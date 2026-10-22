/** Bytes as unpadded base64url, the encoding of keys, nonces and signatures on a link. */
export function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
