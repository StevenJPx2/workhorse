// The core workspace tools: the surface every stage has regardless of plugins.
//
// These were worker-inlined closures over the SandboxHandle, which meant an agent
// could only reference them by NAME. As ordinary ToolFactories they are importable
// like any other tool, so `tools: [read, grep, edit]` on an agent is a real
// dependency the compiler and bundler can both see.
import type { ToolFactory } from "@workhorse/api";
import bash from "./bash";
import edit from "./edit";
import find from "./find";
import grep from "./grep";
import ls from "./ls";
import read from "./read";
import write from "./write";

/** Read-only tools — safe for any stage, including readOnly ones. */
export const coreReadTools: ToolFactory[] = [read, ls, find, grep];

/** Mutating tools. `bash` counts: it can run anything. */
export const coreWriteTools: ToolFactory[] = [write, edit, bash];

export const coreTools: ToolFactory[] = [...coreReadTools, ...coreWriteTools];

export { bash, edit, find, grep, ls, read, write };
