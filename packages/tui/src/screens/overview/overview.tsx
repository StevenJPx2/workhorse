import { createMemo, createSignal, onMount } from "solid-js";
import type { AgentAdapter, Issue } from "workhorse-core";

import { AgentList, IssueList, StatusBar } from "../../components";
import { useWorkhorseContext } from "../../context/workhorse.tsx";
import { createChat } from "../../primitives";
import { createAgents } from "../../primitives/create-agents.ts";
import { createIssues } from "../../primitives/create-issues.ts";
import { getRepoIdentifier } from "../../primitives/get-repo-identifier.ts";
import { ui } from "../../state/ui";
import { getTheme } from "../../theme.ts";
import { OverviewHeader } from "./header.tsx";
import { OverviewInput } from "./input.tsx";
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
    onAgentToggle: (agent: AgentAdapter) => {
      const a = orchestrator.getAgent(agent.issueId);
      if (!a) return;
      if (a.state === "running" || a.state === "starting") void a.stop();
      else if (a.state === "stopped" || a.state === "crashed") void a.start();
    },
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
            // Spawn in background - stay on overview
            ui.startSpawning(issue);

            orchestrator
              .spawn({
                issue,
                repoPath: paths.worktreesRoot.replace(/-worktrees$/, ""),
              })
              .then((agent) => {
                ui.stopSpawning(issue.externalId);
                return agent.start();
              })
              .catch((err) => {
                ui.stopSpawning(issue.externalId);
                ui.showError(`Spawn failed: ${err instanceof Error ? err.message : String(err)}`);
              });
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
          {
            key: "s",
            action: "toggle",
            onActivate: () => {
              const agentId = selectedAgentId();
              if (!agentId) return;
              const agent = orchestrator.getAgent(agentId);
              if (!agent) return;
              if (agent.state === "running" || agent.state === "starting") void agent.stop();
              else if (agent.state === "stopped" || agent.state === "crashed") void agent.start();
            },
          },
          { key: "Ctrl+X M", action: "model" },
        ]}
      />
    </box>
  );
}
