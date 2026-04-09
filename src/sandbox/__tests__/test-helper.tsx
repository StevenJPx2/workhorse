/**
 * Visual test helper - renders components with full provider stack
 *
 * Uses @opentui/solid testRender to render components offscreen,
 * capture frames as plain text, and simulate user input.
 *
 * Known limitation: mockInput.pressEscape() does not fire useKeyboard handlers
 * because the terminal escape sequence parser waits on an async timer to
 * disambiguate \x1b from multi-byte sequences (arrow keys, etc). Test Escape
 * behavior by toggling props instead.
 */

import { testRender } from "@opentui/solid";
import { createSignal } from "solid-js";
import { ThemeProvider } from "../../lib/theme/context.tsx";
import { NavigationProvider } from "../../lib/navigation-provider.tsx";
import { KeyboardProvider } from "../../lib/keyboard-provider.tsx";
import { ModalSystemProvider } from "../../hooks/use-modal-system/index.ts";
import { TicketsProvider } from "../../lib/tickets-context.tsx";
import { WorkflowProvider } from "../../lib/workflow-context.tsx";
import type { ThemeName } from "../../types/config.ts";
import type { JSX } from "solid-js";
import type { UseTicketWorkflowReturn } from "../../hooks/use-ticket-workflow/types.ts";
import type { AgentState } from "../../harness/orchestrator/types.ts";

export interface RenderOptions {
  width?: number;
  height?: number;
  theme?: ThemeName;
}

/**
 * Render a component wrapped in all required providers (Theme, Navigation, Keyboard).
 * Returns the testRender context with frame capture and input simulation.
 */
export async function renderWithProviders(
  component: () => JSX.Element,
  options: RenderOptions = {},
) {
  const { width = 80, height = 24, theme = "tokyonight" } = options;

  const ctx = await testRender(
    () => (
      <ThemeProvider initialTheme={theme}>
        <NavigationProvider>
          <KeyboardProvider>
            <ModalSystemProvider>{component()}</ModalSystemProvider>
          </KeyboardProvider>
        </NavigationProvider>
      </ThemeProvider>
    ),
    { width, height },
  );

  await ctx.renderOnce();

  return ctx;
}

/**
 * Extended render options for Layout-based tests
 */
export interface LayoutRenderOptions extends RenderOptions {
  rig?: string;
}

/**
 * Create a mock workflow for testing Layout
 */
export function createMockWorkflow(
  overrides: Partial<UseTicketWorkflowReturn> = {}
): UseTicketWorkflowReturn {
  const [isLoading] = createSignal(false);
  const [error] = createSignal<Error | null>(null);

  return {
    isLoading,
    error,
    startWork: async () => null,
    stopWork: async () => true,
    restartAgent: async () => true,
    resumeAllAgents: async () => 0,
    getAgentState: () => undefined as AgentState | undefined,
    isAgentRunning: () => false,
    sendToAgent: async () => true,
    getRunningAgents: () => [],
    reloadAgents: () => {},
    ...overrides,
  };
}

/**
 * Render Layout with all required providers and mock data
 */
export async function renderLayoutWithProviders(
  children: () => JSX.Element | null,
  options: LayoutRenderOptions = {},
) {
  const { width = 80, height = 24, theme = "tokyonight", rig = "test-repo" } = options;
  const mockRig = () => rig;

  // Dynamic import to avoid circular dependencies
  const { Layout } = await import("../../app/layout.tsx");

  const ctx = await testRender(
    () => (
      <ThemeProvider initialTheme={theme}>
        <NavigationProvider>
          <KeyboardProvider>
            <ModalSystemProvider>
              <WorkflowProvider repoPath={() => "/tmp/mock"} jiraCloudId={() => "mock.atlassian.net"}>
                <TicketsProvider rig={mockRig} autoLoad={false}>
                  <Layout rig={rig} showAll={false} onQuit={() => {}}>
                    {children()}
                  </Layout>
                </TicketsProvider>
              </WorkflowProvider>
            </ModalSystemProvider>
          </KeyboardProvider>
        </NavigationProvider>
      </ThemeProvider>
    ),
    { width, height },
  );

  await ctx.renderOnce();

  return ctx;
}
