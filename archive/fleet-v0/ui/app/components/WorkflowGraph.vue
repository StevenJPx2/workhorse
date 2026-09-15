<script setup lang="ts">
// Read-only-or-selectable render of a pi-workflow ArtifactGraph spec.
// Faithful mapping: stages = nodes, `from` data edges = connections.
// Layout is computed (topological depth → columns); no positions stored.
import { VueFlow, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";

export interface StageLite {
  id: string;
  type?: string;
  agent?: string;
  from?: string | string[];
  readOnly?: boolean;
  mode?: string;
  until?: unknown;
  maxRounds?: number;
  tools?: unknown[];
  [k: string]: unknown;
}

const props = defineProps<{
  stages: StageLite[];
  selected?: string | null;
  /** Live per-stage status overlay (running ticket): stageId → status. */
  liveStatus?: Record<string, string>;
}>();
const emit = defineEmits<{ select: [id: string | null] }>();

const froms = (s: StageLite): string[] =>
  !s.from ? [] : Array.isArray(s.from) ? s.from : [s.from];

const nodes = computed<Node[]>(() => {
  // Topological depth = column; siblings stack in rows.
  const depth = new Map<string, number>();
  const byId = new Map(props.stages.map((s) => [s.id, s]));
  const calc = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const s = byId.get(id);
    const d = s ? Math.max(-1, ...froms(s).map((f) => calc(f, seen))) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const s of props.stages) calc(s.id, new Set());
  const rows = new Map<number, number>();
  return props.stages.map((s) => {
    const d = depth.get(s.id) ?? 0;
    const row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    const status = props.liveStatus?.[s.id];
    return {
      id: s.id,
      position: { x: d * 230, y: row * 110 },
      data: { stage: s, status },
      type: "stage",
      selected: props.selected === s.id,
    };
  });
});

const edges = computed<Edge[]>(() =>
  props.stages.flatMap((s) =>
    froms(s).map((f) => ({
      id: `${f}->${s.id}`,
      source: f,
      target: s.id,
      animated: props.liveStatus?.[s.id] === "running",
    })),
  ),
);

const statusColor: Record<string, string> = {
  completed: "border-success bg-success/10",
  running: "border-primary bg-primary/10 animate-pulse",
  failed: "border-error bg-error/10",
  pending: "border-default bg-elevated/50",
};
</script>

<template>
  <div class="h-full w-full">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :edges-updatable="false"
      fit-view-on-init
      :min-zoom="0.4"
      :max-zoom="1.6"
      @node-click="(e) => emit('select', e.node.id)"
      @pane-click="emit('select', null)"
    >
      <Background :gap="18" />
      <template #node-stage="{ data, selected: sel }">
        <div
          class="rounded-lg border-2 px-3 py-2 w-48 cursor-pointer bg-default text-left"
          :class="[
            data.status ? statusColor[data.status] : 'border-default',
            sel ? 'ring-2 ring-primary' : '',
          ]"
        >
          <div class="flex items-center gap-1.5">
            <UIcon
              :name="data.stage.readOnly ? 'i-lucide-eye' : 'i-lucide-pencil'"
              class="size-3.5 shrink-0"
              :class="data.stage.readOnly ? 'text-info' : 'text-warning'"
            />
            <span class="font-semibold text-sm truncate">{{ data.stage.id }}</span>
            <UBadge v-if="data.stage.mode === 'loop' || data.stage.until" size="sm" variant="subtle" color="warning" class="ml-auto shrink-0">
              loop
            </UBadge>
          </div>
          <div class="text-xs text-muted mt-1 flex items-center gap-2">
            <span>{{ data.stage.agent ?? "default" }}</span>
            <span v-if="data.stage.tools?.length" class="ml-auto">{{ data.stage.tools.length }} tools</span>
          </div>
          <div v-if="data.status" class="text-[10px] uppercase tracking-wide mt-1 font-medium">
            {{ data.status }}
          </div>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style>
@import "@vue-flow/core/dist/style.css";
</style>
