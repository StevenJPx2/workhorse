// Variant R with coalescing: one Rust kernel instance per isolate; single-request frames run together on a zero-delay timer.
import { RustKernel } from "../ts/rust-kernel.ts";
import kernelModule from "./kernel.wasm";
import { defineShell } from "./shell.ts";

const kernel = new RustKernel(kernelModule);
const shell = defineShell(() => kernel.open(), { coalesce: true });

export const Mailbox = shell.Mailbox;
export default shell.worker;
