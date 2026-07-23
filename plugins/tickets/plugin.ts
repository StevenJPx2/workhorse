// tickets plugin: contributes the fleet-chat operator tools (tools/:
// workhorse_file_ticket/list/status/diff/find_workflow, chat surface),
// fetch_context (stage surface), and the REPO attachment provider — the
// canonical "attach a repo to this work" source for the dispatch composer.
// The ticket API routes themselves are core (worker), not plugin surface.

import type { WorkhorsePlugin } from "@workhorse/api";
import { ticketsTools } from "./tools";

const REPO_RE = /^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/;

export const ticketsPlugin: WorkhorsePlugin = {
  id: "tickets",

  tools: ticketsTools,

  attachments: [
    {
      kind: "repo",
      label: "Repository",
      icon: "i-lucide-github",
      match(input) {
        const m = input.trim().match(REPO_RE);
        // Require an owner/name shape; bare words aren't repos.
        return m?.[1]?.includes("/") ? m[1] : null;
      },
      async resolve(_env, _core, ref) {
        // The repo is cloned at prepare — the attachment is the pointer,
        // not the content.
        return {
          title: ref,
          summary: `GitHub repository ${ref}`,
          content: `Repository: https://github.com/${ref} (cloned into the workspace)`,
          url: `https://github.com/${ref}`,
        };
      },
    },
  ],
};
