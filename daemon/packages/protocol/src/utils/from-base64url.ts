/** Unpadded base64url back to bytes. Callers pass text a schema has already checked. */
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));

  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
}
