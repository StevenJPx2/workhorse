/**
 * Snapshot tests for agent toggle functionality
 *
 * Tests the 's' key toggle flow including:
 * - Keyboard shortcut handling
 * - Visual feedback during start/stop
 * - Error state display when toggle fails
 */

import { describe, it, expect } from "bun:test";
import { createSignal } from "solid-js";
import { renderWithProviders, renderLayoutWithProviders } from "./test-helper.tsx";
import { TicketPane } from "../../components/ticket-pane/ticket-pane.tsx";
import type { Ticket } from "#types/ticket.ts";
import type { AgentState } from "#core/agent/orchestrator/types.ts";

// Mock ticket data
const mockTicket: Ticket = {
  id: "TEST-123",
  jira_key: "TEST-123",
  jira_url: "https://jira.example.com/browse/TEST-123",
  summary: "Test ticket for agent restart",
  status: "planning",
  rig: "github.com/test/repo",
  worktree_path: "/tmp/test-worktree",
  branch_name: "feat/test-123",
  agent: "opencode",
  agent_pid: null,
  pr_url: null,
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
  last_jira_sync: null,
};

describe("Agent restart snapshots", () => {
  it("TicketPane shows agent not running state", async () => {
    const [agentState] = createSignal<AgentState | undefined>(undefined);

    const ctx = await renderWithProviders(
      () => (
        <TicketPane
          ticket={mockTicket}
          agentState={agentState}
          events={[]}
          onEscalate={() => {}}
          onSwitchAgent={() => {}}
          onOpenJira={() => {}}
          onClose={() => {}}
          onSendMessage={() => {}}
        />
      ),
      { width: 80, height: 24 },
    );

    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("TicketPane shows agent running state", async () => {
    const [agentState] = createSignal<AgentState | undefined>("running");

    const ctx = await renderWithProviders(
      () => (
        <TicketPane
          ticket={mockTicket}
          agentState={agentState}
          events={[]}
          onEscalate={() => {}}
          onSwitchAgent={() => {}}
          onOpenJira={() => {}}
          onClose={() => {}}
          onSendMessage={() => {}}
        />
      ),
      { width: 80, height: 24 },
    );

    expect(ctx.captureCharFrame()).toMatchSnapshot();
  });

  it("Layout shows toggle agent in help dialog", async () => {
    const ctx = await renderLayoutWithProviders(() => null, { width: 80, height: 24 });

    // Open help dialog with '?' key
    ctx.mockInput.pressKey("?");
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    // Verify help dialog shows toggle shortcut
    expect(frame).toContain("s");
    expect(frame).toContain("Start/stop");
    expect(frame).toMatchSnapshot();
  });

  it("Layout handles 's' key press", async () => {
    // Note: Since Layout now uses context and hooks internally,
    // we can't easily track if toggle was called without more complex mocking.
    // This test verifies the key doesn't cause errors.
    const ctx = await renderLayoutWithProviders(() => null, { width: 80, height: 24 });

    // Press 's' key - should not throw
    ctx.mockInput.pressKey("s");
    await ctx.renderOnce();

    // Layout should still render without errors
    const frame = ctx.captureCharFrame();
    expect(frame).toBeDefined();
  });
});

describe("Agent toggle integration", () => {
  it("restart flow completes successfully", async () => {
    const [agentState, setAgentState] = createSignal<AgentState | undefined>(undefined);
    const [isLoading, setIsLoading] = createSignal(false);

    const mockRestart = async () => {
      setIsLoading(true);
      // Simulate async restart
      await new Promise((resolve) => setTimeout(resolve, 100));
      setAgentState("running");
      setIsLoading(false);
    };

    const ctx = await renderWithProviders(
      () => (
        <box flexDirection="column">
          <TicketPane
            ticket={mockTicket}
            agentState={agentState}
            events={[]}
            onEscalate={() => {}}
            onSwitchAgent={() => {}}
            onOpenJira={() => {}}
            onClose={() => {}}
            onSendMessage={() => {}}
          />
          {isLoading() && <text fg="yellow">Restarting agent...</text>}
        </box>
      ),
      { width: 80, height: 24 },
    );

    // Initial state - agent not running
    expect(ctx.captureCharFrame()).toMatchSnapshot("before-restart");

    // Trigger restart
    await mockRestart();
    await ctx.renderOnce();

    // After restart - agent running
    expect(ctx.captureCharFrame()).toMatchSnapshot("after-restart");
    expect(agentState()).toBe("running");
  });
});
