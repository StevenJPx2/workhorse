/** DER bytes as PEM text with the given label, base64 in 64-character lines (RFC 7468). */
export function pem(label: string, der: Uint8Array): string {
  const lines =
    Buffer.from(der)
      .toString("base64")
      .match(/.{1,64}/g) ?? [];

  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
