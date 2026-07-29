// memory_write — record a durable fact about this repo.
//
// Replaces Magic Context's ctx_memory. The write goes straight into the shared AI
// Search instance rather than a sandbox-local SQLite file that had to be shipped
// back out after the run — so a memory survives even if the run later fails.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { MEMORY_CATEGORIES, writeMemory } from "../memory";

export default tool({
  name: "memory_write",
  description:
    "Record ONE durable fact about this repository for future agents: a project rule, an " +
    "architectural fact, a hard-won constraint, a config value, or a naming convention. Write one " +
    "when you learn something that would have saved you time had you known it at the start.",
  docs: `
memory_write — one durable fact about THIS repository.

ARGUMENTS
  category  (required) one of: ${MEMORY_CATEGORIES.join(", ")}
  content   (required) ONE standalone fact

CATEGORIES
  PROJECT_RULES  how this repo insists things are done ("releases go through
                 scripts/release.sh")
  ARCHITECTURE   how it is put together ("the worker is the only composition root")
  CONSTRAINTS    something learned the hard way ("the D1 baseline must stay
                 idempotent — prod predates the migration ledger")
  CONFIG_VALUES  a value or path that is not obvious ("local D1 lives under
                 worker/.wrangler/state/v3/d1")
  NAMING         a convention ("repos are stored as owner/name, never a URL")

WHAT MAKES A GOOD MEMORY
  Standalone. It will be read by an agent with none of your context, so
  "the timeout needs raising" is useless and "sandbox exec defaults to 120s;
  builds need 300s" is not.

  Durable. Record what stays true, not what you just did — that belongs in your
  analysis, which is indexed separately as fleet knowledge.

  Specific. A memory that restates the obvious costs a future agent a retrieval
  slot that a real fact could have filled.

WHEN NOT TO USE
  - To summarize your work. That is your submit_work analysis.
  - For anything a reader could see by reading the code.
`,
  input: v.object({
    category: v.picklist(MEMORY_CATEGORIES),
    content: v.string(),
  }),
  async run({ input, env, ticket }) {
    if (!ticket.repo) return "memory_write: no repo in this context.";

    const content = input.content.trim();
    if (!content) return "memory_write: content is empty.";

    const ok = await writeMemory(env, {
      repo: ticket.repo,
      category: input.category,
      content,
      ticketId: ticket.id,
      createdAt: new Date().toISOString(),
    });

    // Reported honestly rather than swallowed: an agent told the write succeeded
    // when it did not may skip recording the fact elsewhere.
    return ok
      ? `Recorded a ${input.category} memory for this repo.`
      : "memory_write: the index is unavailable; the memory was NOT recorded.";
  },
});
