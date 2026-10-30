// Variant RI: one Rust kernel instance per Durable Object, freed with it by the garbage collector.
import { RustKernel } from "../ts/rust-kernel.ts";
import kernelModule from "./kernel.wasm";
import { defineShell } from "./shell.ts";

const shell = defineShell(() => new RustKernel(kernelModule).open(), { coalesce: false });

export const Mailbox = shell.Mailbox;
export default shell.worker;
