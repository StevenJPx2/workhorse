/** A DER length: one byte below 128, otherwise 0x80 + count, then the fewest big-endian bytes. */
export function length(size: number): Uint8Array {
  if (size < 0x80) return Uint8Array.of(size);
  const bytes: number[] = [];

  for (let rest = size; rest > 0; rest = Math.floor(rest / 0x100)) bytes.unshift(rest % 0x100);

  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}
