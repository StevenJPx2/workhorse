// Variant A: TypeScript core, called directly.
import { Mailbox as Rules } from "../../core-ts/mailbox.ts";
import { defineShell } from "./shell.ts";

const shell = defineShell(() => new Rules());

export { Net } from "./shell.ts";
export const Mailbox = shell.Mailbox;
export default shell.worker;
