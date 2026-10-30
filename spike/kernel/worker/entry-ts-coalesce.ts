// Variant A with coalescing: the TypeScript rules; single-request frames run together on a zero-delay timer.
import { openTsMailbox } from "../ts/ts-kernel.ts";
import { defineShell } from "./shell.ts";

const shell = defineShell(openTsMailbox, { coalesce: true });

export const Mailbox = shell.Mailbox;
export default shell.worker;
