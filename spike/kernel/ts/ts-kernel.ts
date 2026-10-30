// Variant A behind the same Core interface as the Rust kernel.
import { Mailbox } from "./mailbox.ts";
import type { Core } from "./rust-kernel.ts";

export function openTsMailbox(): Core {
  const mailbox = new Mailbox();
  return {
    handle: (input) => mailbox.handle(input),
    handleBatch: (inputs) => inputs.map((input) => mailbox.handle(input)),
    close: () => undefined,
  };
}
