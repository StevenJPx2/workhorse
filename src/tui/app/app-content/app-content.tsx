/**
 * AppContent component - Main dashboard content with rig detection, workflow, and Layout rendering
 */

import { createSignal, createEffect } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { initDatabase } from "#core/db/index.ts";
import { detectRig, type RigInfo } from "#core/git/detect-rig.ts";
import { TicketsProvider } from "../../contexts/tickets-context.tsx";
import { WorkflowProvider } from "../../contexts/workflow-context.tsx";
import { EventLogProvider } from "../../contexts/event-log-context.tsx";
import { useConfig, useAtlassian } from "../../hooks/index.ts";
import { InnerContent } from "./inner-content.tsx";
import type { AppContentProps } from "./types.ts";

/**
 * Main app content with data loading and layout
 */
export function AppContent(props: AppContentProps) {
  const renderer = useRenderer();
  const [rigInfo, setRigInfo] = createSignal<RigInfo | null>(null);
  const [loading, setLoading] = createSignal(true);

  const config = useConfig({ autoLoad: true });
  const cloudId = () => config.config()?.jira.cloud_id;
  const rig = () => rigInfo()?.rig ?? undefined;
  const gitRoot = () => rigInfo()?.gitRoot;

  const atlassian = useAtlassian({ cloudId, autoConnect: false });

  // Initial load effect
  createEffect(() => {
    (async () => {
      try {
        initDatabase();
        const info = await detectRig();
        if (info) setRigInfo(info);
      } finally {
        setLoading(false);
      }
    })();
  });

  return (
    <WorkflowProvider
      repoPath={gitRoot}
      jiraCloudId={cloudId}
      onError={(err) => console.error("Workflow error:", err)}
    >
      <TicketsProvider rig={rig} autoLoad={!loading()}>
        <EventLogProvider>
          <InnerContent
            showAll={props.showAll}
            rig={rig()}
            loading={loading()}
            atlassian={atlassian}
            config={config}
            onQuit={() => renderer.destroy()}
          />
        </EventLogProvider>
      </TicketsProvider>
    </WorkflowProvider>
  );
}
