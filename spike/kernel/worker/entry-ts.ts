// Variant A: the TypeScript rules, called directly.
import { openTsMailbox } from "../ts/ts-kernel.ts";
import { defineShell } from "./shell.ts";

const shell = defineShell(openTsMailbox, { coalesce: false });

export const Mailbox = shell.Mailbox;
export default shell.worker;
