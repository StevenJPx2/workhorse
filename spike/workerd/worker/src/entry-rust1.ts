// Variant C: Rust rules and wasm glue in the single `core-one` crate; JSON across the boundary.
import type { Effect } from "../../core-ts/mailbox.ts";
// @ts-expect-error -- workerd supplies .wasm modules as compiled WebAssembly.Module
import wasmModule from "./spike_core_one_bg.wasm";
import { Core, initSync } from "../gen-one/spike_core_one.js";
import { defineShell } from "./shell.ts";

initSync({ module: wasmModule });

const shell = defineShell(() => {
  const core = new Core();
  return { handle: (input) => JSON.parse(core.handle(JSON.stringify(input))) as Effect[] };
});

export { Net } from "./shell.ts";
export const Mailbox = shell.Mailbox;
export default shell.worker;
