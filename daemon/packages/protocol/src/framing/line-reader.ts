/** One complete line from the byte stream, or a line that is not valid UTF-8. */
export type Frame =
  | { readonly type: "line"; readonly text: string }
  | { readonly type: "invalid_utf8" };

/** The lines completed by one chunk, and whether the current line went over the limit. */
export type Pushed = { readonly frames: readonly Frame[]; readonly overflow: boolean };

const NEWLINE = 0x0a;

/**
 * Splits a byte stream into lines, one JSON-RPC message per line. Empty lines are skipped. A line
 * longer than the limit is rejected, never truncated: the reader stops for good and the
 * connection must be closed.
 */
export class LineReader {
  // Pieces of the current, unfinished line. Joined once, when its newline arrives.
  #pending: Uint8Array[] = [];
  #pendingBytes = 0;
  #overflowed = false;
  readonly #maxLineBytes: number;
  readonly #decoder = new TextDecoder("utf-8", { fatal: true });

  constructor(maxLineBytes: number) {
    this.#maxLineBytes = maxLineBytes;
  }

  push(chunk: Uint8Array): Pushed {
    const frames: Frame[] = [];

    if (this.#overflowed) return { frames, overflow: true };
    let start = 0;

    for (let end = chunk.indexOf(NEWLINE); end !== -1; end = chunk.indexOf(NEWLINE, start)) {
      if (!this.#append(chunk.subarray(start, end))) return { frames, overflow: true };
      const line = this.#take();

      if (line.length > 0) frames.push(this.#decode(line));
      start = end + 1;
    }

    const overflow = !this.#append(chunk.subarray(start));

    return { frames, overflow };
  }

  #append(piece: Uint8Array): boolean {
    this.#pendingBytes += piece.length;

    if (this.#pendingBytes > this.#maxLineBytes) {
      this.#overflowed = true;
      this.#pending = [];

      return false;
    }

    if (piece.length > 0) this.#pending.push(piece.slice());

    return true;
  }

  #take(): Uint8Array {
    const line = new Uint8Array(this.#pendingBytes);
    let offset = 0;

    for (const piece of this.#pending) {
      line.set(piece, offset);
      offset += piece.length;
    }

    this.#pending = [];
    this.#pendingBytes = 0;

    return line;
  }

  #decode(line: Uint8Array): Frame {
    try {
      return { type: "line", text: this.#decoder.decode(line) };
    } catch {
      return { type: "invalid_utf8" };
    }
  }
}
