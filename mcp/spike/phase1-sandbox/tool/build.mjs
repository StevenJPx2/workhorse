import { mkdir, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { componentize } from "@bytecodealliance/componentize-js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// Author in TypeScript; strip types to the JS module componentize-js consumes.
const ts = await readFile(here("./tool.ts"), "utf8");
const js = stripTypeScriptTypes(ts, { mode: "strip" });
await writeFile(here("./tool.js"), js);

// Disable every WASI-backed feature so the guest's only import is the host
// capability itself — a truly pure component. A guest `fetch` traps (no
// network) and there is no ambient filesystem: the sandbox is the default,
// capabilities are the exception.
const { component } = await componentize({
  sourcePath: here("./tool.js"),
  witPath: here("../wit"),
  worldName: "tool",
  disableFeatures: ["random", "clocks", "http", "fetch-event", "stdio"],
});

await mkdir(here("../build"), { recursive: true });
await writeFile(here("../build/tool.component.wasm"), component);

console.log("wrote build/tool.component.wasm");
