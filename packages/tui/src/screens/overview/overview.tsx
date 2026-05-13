import { createMemo, createSignal, onMount } from "solid-js";
import type { AgentAdapter, Issue } from "workhorse-core";
import { AgentList, IssueList, StatusBar } from "../../components";
import { useWorkhorseContext } from "../../context/workhorse.tsx";
import { createChat } from "../../primitives";
import { createAgents } from "../../primitives/create-agents.ts";
import { createIssues } from "../../primitives/create-issues.ts";
import { getRepoIdentifier } from "../../primitives/get-repo-identifier.ts";
import { ui } from "../../state/ui.ts";
import { getTheme } from "../../theme.ts";
import { OverviewHeader } from "./overview-header.tsx";
import { OverviewInput } from "./overview-input.tsx";
import { useOverviewBindings } from "./use-overview-bindings.ts";

/**
 * Overview screen - main landing page with two-pane layout (issues | agents).
 * Tab cycles focus, arrow keys navigate, Enter selects.
 */
export function Overview() {
  const theme = getTheme();
  const { paths, tracker, orchestrator } = useWorkhorseContext();
  const [issueIndex, setIssueIndex] = createSignal(0);
  const [agentIndex, setAgentIndex] = createSignal(0);
  const { agents } = createAgents();

  // oxlint-disable-next-line workhorse/no-single-use-variable
  const selectedAgentId = createMemo(() =>
    agents().length > 0 && agentIndex() >= 0 && agentIndex() < agents().length
      ? (agents()[agentIndex()]?.issueId ?? null)
      : null,
  );

  // oxlint-disable-next-line workhorse/no-single-use-variable
  const chatContextId = createMemo(() =>
    ui.lastFocusedList() === "agents" ? selectedAgentId() : null,
  );

  const { messages, send } = createChat(chatContextId);
  const [currentRepo, setCurrentRepo] = createSignal<string | undefined>(undefined);

  onMount(async () => {
    setCurrentRepo(await getRepoIdentifier(paths.worktreesRoot.replace(/-worktrees$/, "")));
  });

  // oxlint-disable-next-line workhorse/no-single-use-variable
  const issues = createIssues({ repository: "auto" });

  useOverviewBindings({
    issues,
    agents,
    issueIndex,
    setIssueIndex,
    agentIndex,
    setAgentIndex,
    onIssueSelect: (issue: Issue) => ui.openSpawnModal(issue),
    onAgentSelect: (agent: AgentAdapter) => ui.enterAgentView(agent.issueId),
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      <OverviewHeader />
      <box flexDirection="row" flexGrow={1}>
        <IssueList
          onSelect={(issue: Issue) => ui.openSpawnModal(issue)}
          selectedIndex={issueIndex()}
        />
        <box width={1} backgroundColor={theme.colors.surface} />
        <AgentList
          onSelect={(agent: AgentAdapter) => ui.enterAgentView(agent.issueId)}
          selectedIndex={agentIndex()}
        />
      </box>
      <OverviewInput
        messages={messages}
        chatContextId={chatContextId}
        onSubmit={async (msg: string) => {
          if (ui.lastFocusedList() === "agents" && selectedAgentId()) {
            send(msg);
            ui.enterAgentView(selectedAgentId()!);
            return;
          }
          try {
            const issue = await tracker.parseInput(msg, { repository: currentRepo() });
            await orchestrator
              .spawn({ issue, repoPath: paths.worktreesRoot.replace(/-worktrees$/, "") })
              .then((a) => a.start());
            ui.enterAgentView(issue.externalId);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("credentials not found") || message.includes("authenticate")) {
              ui.showError(
                `${message}\n\nRestart workhorse to authenticate, or set up credentials manually.`,
              );
            } else {
              ui.showError(message);
            }
          }
        }}
        onEmptySubmit={() => {
          const issue = issues()[issueIndex()];
          if (issue) ui.openSpawnModal(issue);
        }}
      />
      <StatusBar
        shortcuts={[
          { key: "↑↓", action: "scroll" },
          { key: "←→", action: "switch" },
          { key: "Tab", action: "cycle" },
          { key: "Enter", action: "select" },
          { key: "Ctrl+X M", action: "model" },
        ]}
      />
    </box>
  );
}
