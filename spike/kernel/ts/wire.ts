// The shell's side of kernel/src/wire.rs: encodes a batch of inputs straight into
// wasm memory and decodes the effects the kernel wrote back. Little-endian
// integers; input text is a u32 byte length followed by UTF-8; effect text is
// inline or a reference to the causing input's key or event.
import type { Effect, Input, Reply } from "./mailbox.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const TWO_32 = 2 ** 32;

// UTF-8 needs at most 3 bytes per UTF-16 code unit.
const textBound = (text: string) => 4 + 3 * text.length;

function inputBound(input: Input): number {
  switch (input.type) {
    case "restore": {
      let bytes = 1 + 4 + 1 + 8;
      for (const stored of input.events) bytes += 8 + textBound(stored.key) + textBound(stored.event) + 1;
      return bytes;
    }
    case "connect":
      return 1;
    case "publish":
      return 1 + textBound(input.key) + textBound(input.event);
    case "ack":
    case "tick":
      return 1 + 8;
    case "every":
      return 1 + 16;
  }
}

/** Upper bound on the encoded size of a batch. */
export function encodedBound(inputs: readonly Input[]): number {
  let bytes = 4;
  for (const input of inputs) bytes += inputBound(input);
  return bytes;
}

class Writer {
  offset = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly view: DataView,
  ) {}

  u8(value: number): void {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  u32(value: number): void {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  u64(value: number): void {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.view.setUint32(this.offset + 4, Math.floor(value / TWO_32), true);
    this.offset += 8;
  }

  // ASCII is written byte by byte; `subarray` and `encodeInto` cost more than that for
  // short keys and events. Anything else restarts the text through `encodeInto`.
  // Typed-array stores past the end are silently dropped, unlike DataView's, so the
  // bound is checked once per text.
  text(text: string): void {
    const start = this.offset + 4;
    if (start + text.length > this.bytes.length) throw new RangeError("batch exceeds its encoded bound");
    const bytes = this.bytes;
    for (let i = 0; i < text.length; i += 1) {
      const unit = text.charCodeAt(i);
      if (unit >= 0x80) return this.wideText(text);
      bytes[start + i] = unit;
    }
    this.view.setUint32(this.offset, text.length, true);
    this.offset = start + text.length;
  }

  private wideText(text: string): void {
    const { written } = encoder.encodeInto(text, this.bytes.subarray(this.offset + 4));
    this.view.setUint32(this.offset, written, true);
    this.offset += 4 + written;
  }

  input(input: Input): void {
    switch (input.type) {
      case "restore":
        this.u8(0);
        this.u32(input.events.length);
        for (const stored of input.events) {
          this.u64(stored.seq);
          this.text(stored.key);
          this.text(stored.event);
          this.u8(stored.acked ? 1 : 0);
        }
        this.u8(input.every_ms === null ? 0 : 1);
        if (input.every_ms !== null) this.u64(input.every_ms);
        return;
      case "connect":
        return this.u8(1);
      case "publish":
        this.u8(2);
        this.text(input.key);
        return this.text(input.event);
      case "ack":
        this.u8(3);
        return this.u64(input.seq);
      case "every":
        this.u8(4);
        this.u64(input.interval_ms);
        return this.u64(input.now_ms);
      case "tick":
        this.u8(5);
        return this.u64(input.now_ms);
    }
  }
}

/** Writes a batch into `bytes` (at least `encodedBound(inputs)` long) and returns its length. */
export function encodeBatch(inputs: readonly Input[], bytes: Uint8Array, view: DataView): number {
  const writer = new Writer(bytes, view);
  writer.u32(inputs.length);
  for (const input of inputs) writer.input(input);
  return writer.offset;
}

const TEXT_INLINE = 0;
const TEXT_INPUT_KEY = 1;
const TEXT_INPUT_EVENT = 2;

class Reader {
  offset = 0;
  /** The input whose effects are being read; effect text can refer to its key and event. */
  origin: Input | undefined;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly view: DataView,
  ) {}

  u8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  u64(): number {
    const low = this.view.getUint32(this.offset, true);
    const high = this.view.getUint32(this.offset + 4, true);
    this.offset += 8;
    return low + high * TWO_32;
  }

  text(): string {
    const kind = this.u8();
    if (kind === TEXT_INPUT_KEY || kind === TEXT_INPUT_EVENT) {
      if (this.origin?.type !== "publish") throw new Error("kernel referred to a text its input does not have");
      return kind === TEXT_INPUT_KEY ? this.origin.key : this.origin.event;
    }
    if (kind !== TEXT_INLINE) throw new Error(`unknown text kind ${kind}`);
    const length = this.u32();
    const text = decoder.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return text;
  }

  reply(): Reply {
    const tag = this.u8();
    switch (tag) {
      case 0:
        return { status: "published", seq: this.u64() };
      case 1:
        return { status: "duplicate" };
      case 2:
        return { status: "acked", seq: this.u64() };
      case 3:
        return { status: "unknown_seq", seq: this.u64() };
      case 4:
        return { status: "scheduled" };
      case 5:
        return { status: "restored", unacked: this.u64(), remembered: this.u64() };
      case 6:
        return { status: "connected", pending: this.u64() };
      case 7:
        return { status: "ticked" };
      default:
        throw new Error(`unknown reply tag ${tag}`);
    }
  }

  effect(): Effect {
    const tag = this.u8();
    switch (tag) {
      case 0:
        return { type: "persist", seq: this.u64(), key: this.text(), event: this.text() };
      case 1:
        return { type: "mark_acked", seq: this.u64() };
      case 2:
        return { type: "deliver", seq: this.u64(), key: this.text(), event: this.text() };
      case 3:
        return { type: "save_task", interval_ms: this.u64() };
      case 4:
        return { type: "set_alarm", at_ms: this.u64() };
      case 5:
        return { type: "reply", result: this.reply() };
      default:
        throw new Error(`unknown effect tag ${tag}`);
    }
  }
}

/** Reads each input's effects from the kernel's output, `start` to `end` in `bytes`. */
export function decodeOutputs(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  inputs: readonly Input[],
): Effect[][] {
  const reader = new Reader(bytes, view);
  reader.offset = start;
  const outputs: Effect[][] = [];
  for (const input of inputs) {
    reader.origin = input;
    const effects: Effect[] = [];
    for (let left = reader.u32(); left > 0; left -= 1) effects.push(reader.effect());
    outputs.push(effects);
  }
  if (reader.offset !== end) throw new Error("kernel output does not end where the kernel said");
  return outputs;
}
