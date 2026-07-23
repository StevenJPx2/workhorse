// workhorse_ticket_diff — the persisted git patch of a finished ticket (chat surface).
import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "workhorse_ticket_diff",
  surfaces: ["chat"],
  description: "Fetch the persisted git patch of a finished Workhorse ticket.",
  input: v.object({ id: v.string() }),
  async run({ input, core }) {
    const diff = await core.ticketDiff(input.id);
    if (!diff) return `No diff persisted for ${input.id}.`;
    return diff.slice(0, 20_000);
  },
});
