<script setup lang="ts">
// Read-only workflow view: the graph + a per-stage inspector. Workflows are
// hard-coded defs (code), so there is no editing here — the spec is served
// from packages/workflow's static registry.
import type { StageLite } from "~/components/WorkflowGraph.vue";

interface WorkflowEntry {
  name: string;
  description?: string;
  spec: {
    schemaVersion: number;
    name: string;
    description?: string;
    defaults?: Record<string, unknown>;
    artifactGraph: { stages: StageLite[] };
    [k: string]: unknown;
  };
  readOnly?: boolean;
}

const route = useRoute();
const name = computed(() => String(route.params.name));
const { data } = await useFetch<{ workflow: WorkflowEntry }>(() => `/api/workflows/${name.value}`);

const spec = computed(() => data.value?.workflow?.spec ?? null);
const stages = computed<StageLite[]>(() => spec.value?.artifactGraph?.stages ?? []);
const selectedId = ref<string | null>(null);
const selected = computed(() => stages.value.find((s) => s.id === selectedId.value) ?? null);

function toolNames(s: StageLite): string[] {
  return (s.tools ?? []).map((t) => (typeof t === "string" ? t : (t as { name: string }).name));
}
function fromList(s: StageLite): string[] {
  const f = (s as { from?: string | string[] }).from;
  return !f ? [] : Array.isArray(f) ? f : [f];
}
</script>

<template>
  <div v-if="data?.workflow" class="space-y-4">
    <div class="flex items-center gap-3 flex-wrap">
      <NuxtLink to="/workflows" class="text-muted hover:underline text-sm">← workflows</NuxtLink>
      <h1 class="text-xl font-bold">{{ name }}</h1>
      <UBadge color="neutral" variant="subtle" icon="i-lucide-lock">read-only</UBadge>
      <span class="text-muted text-sm truncate">{{ spec?.description }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- graph -->
      <UCard class="lg:col-span-2" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="h-[420px]">
          <ClientOnly>
            <WorkflowGraph :stages="stages" :selected="selectedId" @select="selectedId = $event" />
            <template #fallback>
              <div class="h-full flex items-center justify-center text-muted text-sm">loading canvas…</div>
            </template>
          </ClientOnly>
        </div>
      </UCard>

      <!-- inspector (read-only) -->
      <UCard>
        <template #header>
          <div class="font-semibold text-sm">{{ selected ? `Stage: ${selected.id}` : "Select a stage" }}</div>
        </template>
        <div v-if="selected" class="space-y-3 text-sm">
          <div>
            <div class="text-xs text-muted mb-0.5">from</div>
            <div>{{ fromList(selected).join(", ") || "(entry stage)" }}</div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-xs text-muted mb-0.5">agent</div>
              <div>{{ (selected.agent as string) ?? "default" }}</div>
            </div>
            <div>
              <div class="text-xs text-muted mb-0.5">thinking</div>
              <div>{{ (selected.thinking as string) ?? "low" }}</div>
            </div>
          </div>
          <div v-if="(selected as { outcome?: string }).outcome">
            <div class="text-xs text-muted mb-0.5">outcome</div>
            <UBadge color="primary" variant="subtle">{{ (selected as { outcome?: string }).outcome }}</UBadge>
          </div>
          <div>
            <div class="text-xs text-muted mb-0.5">tools ({{ toolNames(selected).length }})</div>
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="t in toolNames(selected)" :key="t" color="neutral" variant="subtle" size="sm">{{ t }}</UBadge>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted mb-0.5">prompt</div>
            <pre class="whitespace-pre-wrap font-mono text-xs bg-elevated rounded p-2 max-h-64 overflow-y-auto">{{ selected.prompt }}</pre>
          </div>
        </div>
        <div v-else class="text-muted text-sm">
          Click a node to inspect its agent, tools, and prompt. Edges come from each stage's
          <code>from</code> field.
        </div>
      </UCard>
    </div>
  </div>
</template>
