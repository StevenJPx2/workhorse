// Variant R: one Rust kernel instance per isolate; each Durable Object is one mailbox in it.
import { RustKernel } from "../ts/rust-kernel.ts";
import kernelModule from "./kernel.wasm";
import { defineShell } from "./shell.ts";

const kernel = new RustKernel(kernelModule);
const shell = defineShell(() => kernel.open(), { coalesce: false });

export const Mailbox = shell.Mailbox;
export default shell.worker;
