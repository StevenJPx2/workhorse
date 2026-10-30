// Variant R: the Rust kernel behind raw wasm exports. One instance holds any
// number of mailboxes, each addressed by a small integer.
import type { Effect, Input } from "./mailbox.ts";
import { decodeOutputs, encodeBatch, encodedBound } from "./wire.ts";

export type Core = {
  handle(input: Input): Effect[];
  handleBatch(inputs: readonly Input[]): Effect[][];
  close(): void;
};

type KernelExports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  step(mailbox: number, len: number): number;
  output(): number;
  close(mailbox: number): void;
};

function kernelExports(exports: WebAssembly.Exports): KernelExports {
  const { memory, alloc, step, output, close } = exports;
  if (
    !(memory instanceof WebAssembly.Memory) ||
    typeof alloc !== "function" ||
    typeof step !== "function" ||
    typeof output !== "function" ||
    typeof close !== "function"
  ) {
    throw new Error("kernel.wasm lacks an expected export");
  }
  // SAFETY: the signatures are fixed by kernel-wasm/src/lib.rs; the checks above prove each is a function.
  const functions = { alloc, step, output, close } as Omit<KernelExports, "memory">;
  return { memory, ...functions };
}

/** Largest input buffer the kernel grants (`MAX_INPUT` in kernel-wasm/src/lib.rs). */
const MAX_INPUT = 16 * 1024 * 1024;
const MIN_INPUT = 4096;

type Views = { bytes: Uint8Array; view: DataView };

/**
 * The instance's one input buffer and the views over its memory, kept across calls.
 * Creating views and resizing the buffer on every call cost more than the kernel's
 * rules for one input. Views are rebuilt only when memory grows, which replaces the buffer.
 */
class Channel {
  private buffer: ArrayBuffer | undefined;
  private input: Views | undefined;
  private memory: Views | undefined;
  private inputAt = 0;
  private capacity = 0;

  constructor(private readonly exports: KernelExports) {}

  run(mailbox: number, inputs: readonly Input[]): Effect[][] {
    const bound = encodedBound(inputs);
    if (bound > this.capacity) this.reserve(bound);
    // The input views span only the reserved buffer, so encoding cannot write past it.
    const { input } = this.views();
    const length = encodeBatch(inputs, input.bytes, input.view);
    const outputLength = this.exports.step(mailbox, length);
    if (outputLength < 0) throw new Error(`kernel rejected the batch with code ${outputLength}`);
    const output = this.exports.output();
    const { bytes, view } = this.views().memory;
    return decodeOutputs(bytes, view, output, output + outputLength, inputs);
  }

  private reserve(bound: number): void {
    const capacity = Math.min(MAX_INPUT, Math.max(bound, MIN_INPUT, this.capacity * 2));
    const at = this.exports.alloc(capacity);
    if (at === 0 || bound > capacity) throw new Error(`batch of up to ${bound} bytes is over the kernel's limit`);
    this.inputAt = at;
    this.capacity = capacity;
    this.buffer = undefined;
  }

  private views(): { input: Views; memory: Views } {
    const buffer = this.exports.memory.buffer;
    if (buffer !== this.buffer || this.input === undefined || this.memory === undefined) {
      this.buffer = buffer;
      this.input = {
        bytes: new Uint8Array(buffer, this.inputAt, this.capacity),
        view: new DataView(buffer, this.inputAt, this.capacity),
      };
      this.memory = { bytes: new Uint8Array(buffer), view: new DataView(buffer) };
    }
    return { input: this.input, memory: this.memory };
  }
}

export class RustKernel {
  private readonly exports: KernelExports;
  private readonly channel: Channel;
  private lastMailbox = 0;

  constructor(module: WebAssembly.Module) {
    this.exports = kernelExports(new WebAssembly.Instance(module, {}).exports);
    this.channel = new Channel(this.exports);
  }

  open(): Core {
    this.lastMailbox += 1;
    return new RustMailbox(this.exports, this.channel, this.lastMailbox);
  }
}

class RustMailbox implements Core {
  constructor(
    private readonly exports: KernelExports,
    private readonly channel: Channel,
    private readonly id: number,
  ) {}

  handle(input: Input): Effect[] {
    const [effects] = this.channel.run(this.id, [input]);
    if (effects === undefined) throw new Error("kernel returned no output for the input");
    return effects;
  }

  handleBatch(inputs: readonly Input[]): Effect[][] {
    return this.channel.run(this.id, inputs);
  }

  close(): void {
    this.exports.close(this.id);
  }
}
