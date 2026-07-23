// browser_act — click/fill/type/scroll/select/hover by AX ref.
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab } from "./_shared";

export default tool({
  name: "browser_act",
  description:
    "Perform an action on a page element by its ref from browser_snapshot (@e1, @e2, …). Supports " +
    "click, dblclick, fill, type, press, hover, scroll, select, check, uncheck. Always snapshot " +
    "first — refs change after navigation or DOM mutation.",
  input: v.object({
    action: v.picklist(["click", "dblclick", "fill", "type", "press", "hover", "scroll", "select", "check", "uncheck"]),
    selector: v.string(),
    value: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    const args = [input.action, input.selector];
    if (input.value !== undefined) args.push(input.value);
    const raw = await ab(sandbox, args);
    try {
      const jr = JSON.parse(raw) as { url?: string };
      return `${input.action} ${input.selector}${jr.url ? ` → ${jr.url}` : ""}`;
    } catch {
      return raw.trim() || `${input.action} ${input.selector}`;
    }
  },
});
