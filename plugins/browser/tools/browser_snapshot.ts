// browser_snapshot — accessibility tree with element refs (token-cheap).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab } from "./_shared";

export default tool({
  name: "browser_snapshot",
  description:
    "Get the accessibility tree of the current page with element refs (@e1, @e2, …). Interactive " +
    "elements only by default — far cheaper in tokens than raw HTML. Use browser_act to interact " +
    "by ref. Call browser_open first.",
  input: v.object({ depth: v.optional(v.number()), compact: v.optional(v.boolean()) }),
  async run({ sandbox }) {
    const raw = await ab(sandbox, ["snapshot", "-i", "-c", "-d", "10"]);
    try {
      return (JSON.parse(raw) as { snapshot?: string }).snapshot ?? raw;
    } catch {
      return raw;
    }
  },
});
