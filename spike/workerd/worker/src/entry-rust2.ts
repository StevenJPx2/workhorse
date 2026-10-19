// Variant B: Rust rules in `core` (no_std) behind `core-wasm` glue; JSON across the boundary.
import type { Effect } from "../../core-ts/mailbox.ts";
// @ts-expect-error -- workerd supplies .wasm modules as compiled WebAssembly.Module
import wasmModule from "./spike_core_wasm_bg.wasm";
import { Core, initSync } from "../gen/spike_core_wasm.js";
import { defineShell } from "./shell.ts";

initSync({ module: wasmModule });

const shell = defineShell(() => {
  const core = new Core();
  return { handle: (input) => JSON.parse(core.handle(JSON.stringify(input))) as Effect[] };
});

export { Net } from "./shell.ts";
export const Mailbox = shell.Mailbox;
export default shell.worker;
